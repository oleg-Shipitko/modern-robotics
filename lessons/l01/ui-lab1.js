/* =====================================================================
   ui-lab1.js — Лаборатория 1 «Три робота, одна задача».
   ===================================================================== */
'use strict';
const Lab1 = (() => {
  const AG = ['classic', 'e2e', 'hybrid'];
  const NAMES = { classic: 'Правила', e2e: 'End-to-end', hybrid: 'Гибрид' };
  const OK = 'success';
  const STEPS = [
    {
      title: 'Обычный день',
      text: 'Начнём с ситуации, к которой готовы все трое: дневной свет, красная чашка, на пути ничего нет. Под неё инженер писал правила, в ней оператор записывал демонстрации.',
      q: 'Кто дойдёт до чашки?',
      cond: {},
      expect: { classic: OK, e2e: OK, hybrid: OK },
      explain: '<b>Все трое справились.</b> Там, где ситуация предусмотрена правилами и покрыта данными, работают оба подхода. Посмотри на «мысли» Ады. Версия с правилами показывает найденные пиксели чашки (синие клетки), оценку её положения и план пути. У нейросети — четыре «точки интереса» т1–т4, которые она выбрала сама. Какая из них про чашку, а какие ни о чём, сеть не скажет. <br><br>Разница между подходами появится, когда условия выйдут за пределы привычного. Начнём со света.',
    },
    {
      title: 'Вечер',
      text: 'Солнце село, на кухне включили тёплый свет. Всё остальное — как прежде.',
      q: 'Кто дойдёт до чашки?',
      cond: { evening: true },
      expect: { classic: 'explicit', e2e: OK, hybrid: OK },
      explain: '<b>Классика отказала, нейросети справились.</b> Правило восприятия инженер подобрал днём: «красный канал больше 0.60». Тёплый тусклый свет опустил красный канал чашки примерно до 0.54, и правило перестало срабатывать. Переключи камеру внизу в режим «Правило»: синих клеток нет. Нейросети видели в демонстрациях разное освещение и выучили признак, устойчивый к нему. Заметь, классика отказала <i>громко</i>: она знает, что не видит чашку, и остановилась. Исправить правило можно в лаборатории 2. <br><br>Освещение нарушило работу правил. А что нарушит работу нейросети?',
    },
    {
      title: 'Чайник на пути',
      text: 'Днём на стол поставили горячий чайник — прямо между рукой и чашкой.',
      q: 'Кто дойдёт до чашки?',
      cond: { kettle: true },
      expect: { classic: OK, e2e: 'collision', hybrid: OK },
      explain: '<b>Версия end-to-end врезалась, остальные объехали.</b> В демонстрациях не было чайника. У сети нет понятия «препятствие», есть выученная привычка «ехать к красному». Классический планировщик обходит всё, что детектор пометил как препятствие (красные клетки), и это свойство алгоритма, а не статистика. <br><br>Можно ли научить сеть объезду, показав демонстрации? Отчасти. Но есть сложность: оператор объезжает то слева, то справа, а сеть, обученная на среднеквадратичную ошибку, усредняет «влево» и «вправо» в «прямо». Мы проверили это на такой же сети: даже с 1000 демонстраций объезда она врезалась почти всегда. Это проблема мультимодальности действий, ей посвящены уроки 1.3–1.5. <br><br>Вечер нарушает работу правил, чайник — работу end-to-end сети. Что будет, если они придут вместе?',
    },
    {
      title: 'Вечер и чайник',
      text: 'Вечерний свет и чайник на пути одновременно.',
      q: 'Кто дойдёт до чашки?',
      cond: { evening: true, kettle: true },
      expect: { classic: 'explicit', e2e: 'collision', hybrid: OK },
      explain: '<b>Справился только гибрид.</b> Его нейросеть отвечает за то, <i>что и где</i>: находит чашку при любом свете. Классика отвечает за то, <i>как</i>: строит путь в обход чайника и следит за безопасностью. Так устроено большинство продуктов 2026 года. <br><br>Но умная часть здесь — нейросеть: цель гибриду указывает она. Что будет, если она увидит то, чего не было в данных?',
    },
    {
      title: 'Бирюзовая чашка',
      text: 'Дома появились новые бирюзовые чашки. Ни в правилах, ни в демонстрациях таких не было.',
      q: 'Кто дойдёт до чашки?',
      cond: { teal: true },
      expect: { classic: 'explicit', e2e: 'silent', hybrid: 'silent' },
      explain: '<b>Не справился никто, но ошиблись они по-разному.</b> Классика сказала «не вижу чашку» и остановилась. Это громкий отказ: можно позвать человека. Нейросеть и гибрид уверенно поехали к миске с кофейными зёрнами — самому «красноватому» пятну в кадре — и остановились там, будто задача выполнена. Сеть всегда выдаёт ответ, даже когда видит то, чего не было в данных. Это тихий отказ: система не знает, что ошиблась. <br><br>Гибрид здесь не спасает. Безопасность ему гарантирует классика, а правильность цели — только данные. Подумай, чей отказ опаснее дома, где рядом дети и кошка. К этому вопросу вернёмся в части 8.',
    },
    {
      title: 'Свободный режим',
      text: 'Свободный эксперимент. Двигай предметы, включай условия, добавляй шум камеры, прогоняй статистику. Попробуй найти сцену, где нейросеть всё-таки объезжает чайник, — и подумай, почему это не гарантия.',
      free: true,
    },
  ];

  let step = 0;
  const done = new Set();
  let scene = null;
  let conds = { evening: false, kettle: false, teal: false };
  let noise = 0.02;
  let eps = null;
  let running = false, paused = false, speed = 1, thoughts = true;
  let pred = new Set();
  let lastFrame = 0, acc = 0, frameNo = 0;
  let sceneSeed = 1, batchSeed = 1;
  let camMode = 'raw';
  let drag = null;
  let finishedRun = false;
  const panels = {};
  const STEPS_PER_SEC = 26;

  /* ---------- Сцена и условия ---------- */
  function applyConds() {
    scene.light = conds.evening ? RC.LIGHT.evening() : RC.LIGHT.day();
    const cup = RC.sceneCup(scene);
    cup.color = (conds.teal ? RC.COLORS.cupTeal : RC.COLORS.cupRed).slice();
    const k = RC.sceneKettle(scene);
    if (conds.kettle && !k) {
      const p = RC.kettleOnPath(scene.start, cup, null);
      scene.objects.push(RC.makeObj('kettle', p.x, p.y));
    } else if (!conds.kettle && k) {
      scene.objects.splice(scene.objects.indexOf(k), 1);
    }
    scene.version++;
  }
  function syncCondInputs() {
    $$('#condRow input[data-cond]').forEach((inp) => { inp.checked = !!conds[inp.dataset.cond]; });
  }

  function setStep(i) {
    stopRun();
    step = i;
    const st = STEPS[i];
    if (!st.free) {
      conds = { evening: !!st.cond.evening, kettle: !!st.cond.kettle, teal: !!st.cond.teal };
      scene = RC.guidedScene(conds);
    }
    syncCondInputs();
    pred = new Set();
    finishedRun = false;
    renderStepper(); renderMission();
    $('#explain').hidden = true;
    resetEpisodes();
  }

  function goFree() {
    if (STEPS[step].free) return;
    step = STEPS.length - 1;
    renderStepper(); renderMission();
    $('#explain').hidden = true;
  }

  /* ---------- Пошаговая навигация ---------- */
  function renderStepper() {
    const box = $('#stepper');
    box.innerHTML = '';
    STEPS.forEach((st, i) => {
      const b = h('button', { type: 'button', role: 'tab', class: done.has(i) ? 'done' : '', 'aria-current': i === step ? 'step' : null },
        h('span', { class: 'n' }, done.has(i) ? '✓' : st.free ? '∞' : String(i + 1)), st.title);
      b.addEventListener('click', () => setStep(i));
      box.append(b);
    });
  }
  function renderMission() {
    const st = STEPS[step];
    $('#missionTitle').textContent = st.free ? st.title : `Эксперимент ${step + 1} из 5 · ${st.title}`;
    $('#missionText').textContent = st.text;
    const pr = $('#predict');
    pr.innerHTML = '';
    if (!st.free) {
      pr.append(h('span', { class: 'q' }, 'Твой прогноз: ' + st.q.toLowerCase().replace('?', '') + '?'));
      ['classic', 'e2e', 'hybrid', 'none'].forEach((a) => {
        const b = h('button', { type: 'button', class: 'pchip', 'data-a': a, 'aria-pressed': 'false' }, a === 'none' ? 'Никто' : NAMES[a]);
        b.addEventListener('click', () => {
          if (finishedRun) return;
          if (a === 'none') { pred = pred.has('none') ? new Set() : new Set(['none']); }
          else { pred.delete('none'); pred.has(a) ? pred.delete(a) : pred.add(a); }
          $$('.pchip', pr).forEach((c) => c.setAttribute('aria-pressed', pred.has(c.dataset.a) ? 'true' : 'false'));
        });
        pr.append(b);
      });
    }
    updateRunBtn();
  }
  function updateRunBtn() {
    const btn = $('#runBtn');
    if (!App.models.ready) { btn.disabled = true; btn.textContent = '⏳ Нейросети обучаются…'; return; }
    btn.disabled = false;
    btn.textContent = running ? '⏹ Остановить' : finishedRun ? '↻ Ещё раз' : '▶ Запустить';
  }

  /* ---------- Эпизоды ---------- */
  function makeEpisodes() {
    if (!App.models.ready) return null;
    const o = { noise, seed: 77 };
    return {
      classic: new RC.Episode(scene, new RC.ClassicalAgent({ ...App.rules }), o),
      e2e: new RC.Episode(scene, new RC.E2EAgent(App.models.policy), o),
      hybrid: new RC.Episode(scene, new RC.HybridAgent(App.models.percept), o),
    };
  }
  function resetEpisodes() {
    stopRun();
    eps = null; finishedRun = false;
    AG.forEach((a) => setStatus(a, { ico: '⏸', html: 'Готова к запуску' }));
    updateRunBtn();
    drawAll(performance.now());
    updateCamera(true);
  }
  function stopRun() { running = false; paused = false; $('#pauseBtn').textContent = '⏸ Пауза'; }

  function run() {
    if (running) { stopRun(); updateRunBtn(); return; }
    eps = makeEpisodes();
    if (!eps) return;
    running = true; paused = false; finishedRun = false; acc = 0; lastFrame = performance.now();
    $('#explain').hidden = true;
    $$('.pchip').forEach((c) => c.classList.remove('right', 'wrong'));
    updateRunBtn();
    requestAnimationFrame(loop);
  }
  function loop(now) {
    if (!running) return;
    const dt = Math.min(100, now - lastFrame); lastFrame = now;
    if (!paused && !drag) {
      acc += (dt / 1000) * STEPS_PER_SEC * speed;
      while (acc >= 1) { acc -= 1; AG.forEach((a) => { if (!eps[a].done) eps[a].step(); }); }
    }
    frameNo++;
    drawAll(now);
    AG.forEach((a) => setStatus(a, statusOf(eps[a], a)));
    if (frameNo % 3 === 0) updateCamera(false);
    if (AG.every((a) => eps[a].done)) { running = false; finished(); return; }
    requestAnimationFrame(loop);
  }
  function finished() {
    finishedRun = true;
    drawAll(performance.now());
    updateCamera(false);
    updateRunBtn();
    const st = STEPS[step];
    if (st.free) return;
    done.add(step);
    renderStepper();
    showExplanation();
  }

  /* ---------- Статусы ---------- */
  function statusOf(ep, kind) {
    if (!ep) return { ico: '⏸', html: 'Готова к запуску' };
    if (!ep.done) {
      if (kind !== 'e2e' && ep.agent.kf && !ep.agent.kf.x) return { ico: '🔎', html: `Ищу чашку… шаг ${ep.t}` };
      if (ep.agent.view && ep.agent.view.safetyStop) return { ico: '🛑', html: `Монитор безопасности притормозил · шаг ${ep.t}` };
      return { ico: '🤖', html: `Еду к цели · шаг ${ep.t}` };
    }
    const d = ep.detail || {};
    switch (ep.outcome) {
      case 'success': return { cls: 'success', ico: '✅', html: `<b>Дошла</b> до чашки за ${ep.t} ${plural(ep.t, 'шаг', 'шага', 'шагов')}` };
      case 'collision': return { cls: 'collision', ico: '💥', html: '<b>Столкновение:</b> врезалась в горячий чайник' };
      case 'explicit': return { cls: 'explicit', ico: '⛔', html: `<b>Громкий отказ:</b> «${escapeHtml(d.reason)}». Останавливаюсь и зову человека` };
      case 'silent': {
        let where;
        if (d.near && d.near.kind === 'cup') where = 'остановилась рядом с чашкой, но не над ней';
        else if (d.near) where = `уверенно остановилась у предмета «${escapeHtml(d.near.name)}»`;
        else if (d.reason === 'timeout') where = 'так и не добрался до цели';
        else where = 'уверенно остановилась в пустом месте';
        return { cls: 'silent', ico: '🤫', html: `<b>Тихий отказ:</b> ${where}` };
      }
    }
    return { ico: '?', html: '' };
  }
  function setStatus(a, st) {
    const el = panels[a].status;
    el.className = 'agent-status' + (st.cls ? ' ' + st.cls : '');
    el.innerHTML = `<span class="ico">${st.ico}</span><span>${st.html}</span>`;
  }

  /* ---------- Объяснение после запуска ---------- */
  function showExplanation() {
    const st = STEPS[step];
    const actual = {}; AG.forEach((a) => { actual[a] = eps[a].outcome; });
    const matches = AG.every((a) => actual[a] === st.expect[a]);
    const box = $('#explain');
    box.innerHTML = '';
    // сверка прогноза
    let verdict = null;
    if (pred.size) {
      let right = 0;
      AG.forEach((a) => {
        const said = pred.has(a), ok = actual[a] === OK;
        const chip = $(`.pchip[data-a="${a}"]`);
        if (said === ok) { right++; chip.classList.add('right'); } else chip.classList.add('wrong');
      });
      const noneChip = $('.pchip[data-a="none"]');
      if (pred.has('none')) noneChip.classList.add(AG.some((a) => actual[a] === OK) ? 'wrong' : 'right');
      verdict = h('div', { class: 'verdict' }, h('span', { class: 'chip plain' }, `Прогноз совпал для ${right} из 3 роботов`));
    }
    box.append(h('h4', null, matches ? '🔍 Что произошло' : '🔍 Результат отличается от типичного'));
    if (matches) box.append(h('p', { html: st.explain }));
    else {
      const notes = [];
      if (App.rules.wb && st.cond.evening) notes.push('Классика справилась с вечером, потому что в лаборатории 2 включён баланс белого.');
      if (App.rules.teal && st.cond.teal) notes.push('Классика нашла бирюзовую чашку благодаря правилу из лаборатории 2.');
      if (App.models.N !== 200 || !App.models.light) notes.push(`Нейросети сейчас обучены на ${App.models.N} ${plural(App.models.N, 'демонстрации', 'демонстрациях', 'демонстрациях')}${App.models.light ? '' : ' без разнообразия освещения'} — это меняет их поведение.`);
      if (!notes.length) notes.push('Скорее всего, сцена изменилась: передвинуты предметы, изменён шум камеры или сети переобучены. Так и выглядит экспериментальная работа.');
      box.append(h('p', null, notes.join(' ')));
      box.append(h('p', { html: '<span class="muted">Типичный исход этого эксперимента:</span> ' + st.explain }));
    }
    if (verdict) box.append(verdict);
    const next = h('div', { style: 'margin-top:12px' });
    if (step < STEPS.length - 1) next.append(h('button', { class: 'btn', type: 'button', onclick: () => setStep(step + 1) }, step === STEPS.length - 2 ? 'В свободный режим →' : 'Следующий эксперимент →'));
    box.append(next);
    box.hidden = false;
  }

  /* ---------- Отрисовка ---------- */
  function drawAll(now) {
    AG.forEach((a) => {
      SceneView.render(panels[a].canvas, scene, { episode: eps ? eps[a] : null, kind: a, thoughts, time: now });
    });
  }
  function updateCamera(idle) {
    const cam = $('#camCanvas');
    let img;
    if (eps && eps.e2e && !idle) img = eps.e2e.img;
    else { img = RC.renderClean(scene); }
    const per = camMode === 'rule' ? RC.classicalPerceive(img, App.rules) : null;
    SceneView.renderCamera(cam, img, { per });
    // карты внимания
    const maps = $('#seeMaps');
    if (!App.models.ready) { maps.innerHTML = '<span class="small muted">Карты появятся, когда нейросети обучатся.</span>'; return; }
    let feat = null, featH = null;
    if (eps && !idle && eps.e2e.agent.view.nnFeat) feat = eps.e2e.agent.view.nnFeat; else feat = App.models.policy.features(img);
    if (eps && !idle && eps.hybrid.agent.view.nnFeat) featH = eps.hybrid.agent.view.nnFeat; else featH = App.models.percept.features(img);
    const K = feat.kp.length / 2;
    if (maps.children.length !== K + 1 || !maps.querySelector('canvas')) {
      maps.innerHTML = '';
      for (let k = 0; k < K; k++) maps.append(h('figure', null, h('canvas', { 'data-k': k, 'data-net': 'e2e' }), h('figcaption', null, `end-to-end · т${k + 1}`)));
      maps.append(h('figure', null, h('canvas', { 'data-k': 0, 'data-net': 'hyb' }), h('figcaption', null, 'гибрид · «чашка»')));
    }
    $$('canvas', maps).forEach((c) => SceneView.renderAttention(c, c.dataset.net === 'e2e' ? feat.S : featH.S, +c.dataset.k));
  }

  /* ---------- Перетаскивание ---------- */
  function toScene(e, wrap) {
    const r = wrap.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }
  function bindDrag(a) {
    const wrap = panels[a].wrap;
    wrap.addEventListener('pointerdown', (e) => {
      const pt = toScene(e, wrap);
      const hit = SceneView.hitTest(scene, pt);
      if (!hit || (hit === 'start' && running)) return;
      drag = { hit, id: e.pointerId };
      wrap.setPointerCapture(e.pointerId);
      wrap.style.cursor = 'grabbing';
      e.preventDefault();
    });
    wrap.addEventListener('pointermove', (e) => {
      const pt = toScene(e, wrap);
      if (!drag) { wrap.style.cursor = SceneView.hitTest(scene, pt) ? 'grab' : 'default'; return; }
      const x = RC.clamp(pt.x, 0.06, 0.94), y = RC.clamp(pt.y, 0.06, 0.94);
      if (drag.hit === 'start') { scene.start.x = x; scene.start.y = y; }
      else { drag.hit.x = x; drag.hit.y = y; }
      scene.version++;
      if (!running) { if (eps) { eps = null; finishedRun = false; AG.forEach((k) => setStatus(k, { ico: '⏸', html: 'Готова к запуску' })); updateRunBtn(); } drawAll(performance.now()); updateCamera(true); }
    });
    const end = () => { if (drag) { drag = null; wrap.style.cursor = 'grab'; } };
    wrap.addEventListener('pointerup', end); wrap.addEventListener('pointercancel', end);
  }

  /* ---------- Статистика на 40 сценах ---------- */
  async function runBatch() {
    if (!App.models.ready) return;
    const btn = $('#batchBtn');
    btn.disabled = true; btn.textContent = '⏳ Считаю…';
    const scenes = RC.makeTestScenes(40, conds, 5000 + batchSeed++);
    const res = {};
    const gen = (function* () {
      for (const a of AG) {
        const r = { success: 0, collision: 0, explicit: 0, silent: 0, n: scenes.length, modules: {} };
        for (let i = 0; i < scenes.length; i++) {
          const agent = a === 'classic' ? new RC.ClassicalAgent({ ...App.rules }) : a === 'e2e' ? new RC.E2EAgent(App.models.policy) : new RC.HybridAgent(App.models.percept);
          const ep = new RC.Episode(scenes[i], agent, { noise, seed: 1000 + i }).run();
          r[ep.outcome]++;
          if (ep.outcome === 'explicit' && ep.detail) r.modules[ep.detail.module] = (r.modules[ep.detail.module] || 0) + 1;
          yield;
        }
        res[a] = r;
      }
    })();
    await runChunked(gen, null, 20);
    renderBatch(res);
    btn.disabled = false; btn.textContent = '📊 Ещё 40 сцен';
  }
  function renderBatch(res) {
    const box = $('#batchRows');
    box.innerHTML = '';
    const order = [['success', 's-success'], ['explicit', 's-explicit'], ['silent', 's-silent'], ['collision', 's-collision']];
    const tipText = { success: '✅ дошла', explicit: '⛔ громкий отказ', silent: '🤫 тихий отказ', collision: '💥 столкновение' };
    AG.forEach((a) => {
      const r = res[a];
      const bar = h('div', { class: 'stack-bar', role: 'img', 'aria-label': `${NAMES[a]}: ` + order.map(([k]) => `${tipText[k]} ${r[k]}`).join(', ') });
      order.forEach(([k, cls]) => {
        if (!r[k]) return;
        const seg = h('div', { class: cls, style: `flex-grow:${r[k]}` }, r[k] >= 3 ? String(r[k]) : '');
        seg.addEventListener('pointermove', (e) => Tip.show(`<b>${r[k]} из ${r.n}</b><br>${NAMES[a]} · ${tipText[k]}`, e.clientX, e.clientY));
        seg.addEventListener('pointerleave', () => Tip.hide());
        bar.append(seg);
      });
      box.append(h('div', { class: 'stack-row', style: `--c: var(--${a})` }, h('div', { class: 'lab-name' }, NAMES[a]), bar));
    });
    $('#batchLegend').hidden = false;
    const c = res.classic;
    const notes = [];
    const pm = c.modules.perception || 0, plm = c.modules.planning || 0;
    if (pm || plm) notes.push(`Классика сама сообщает, где произошёл отказ: ${pm ? `восприятие — ${pm}` : ''}${pm && plm ? ', ' : ''}${plm ? `планирование — ${plm}` : ''}.`);
    if (res.e2e.silent + res.e2e.collision > 0) notes.push(`У end-to-end ${res.e2e.silent + res.e2e.collision} ${plural(res.e2e.silent + res.e2e.collision, 'неудача', 'неудачи', 'неудач')}, и причину сеть не назовёт: модулей у неё нет.`);
    $('#batchNote').textContent = notes.join(' ');
  }

  /* ---------- Инициализация ---------- */
  function init() {
    $$('#arena .agent-panel').forEach((p) => {
      const a = p.dataset.a;
      panels[a] = { canvas: $('canvas', p), overlay: $('.overlay', p), status: $('.agent-status', p), wrap: $('.agent-canvas-wrap', p) };
      bindDrag(a);
    });
    $('#runBtn').addEventListener('click', run);
    $('#pauseBtn').addEventListener('click', () => {
      if (!running) return;
      paused = !paused; $('#pauseBtn').textContent = paused ? '▶ Продолжить' : '⏸ Пауза';
    });
    $('#resetBtn').addEventListener('click', () => resetEpisodes());
    $('#newSceneBtn').addEventListener('click', () => {
      goFree(); stopRun();
      const rng = new RC.Rng(1000 + sceneSeed++ * 7919);
      scene = RC.randomScene(rng, { light: conds.evening ? 'evening' : 'day', cup: conds.teal ? 'teal' : 'red', kettle: conds.kettle });
      resetEpisodes();
    });
    $$('[data-speed]').forEach((b) => b.addEventListener('click', () => {
      speed = +b.dataset.speed;
      $$('[data-speed]').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    }));
    $('#thoughtsChk').addEventListener('change', (e) => { thoughts = e.target.checked; drawAll(performance.now()); });
    $$('#condRow input[data-cond]').forEach((inp) => inp.addEventListener('change', () => {
      conds[inp.dataset.cond] = inp.checked;
      goFree();
      applyConds();
      resetEpisodes();
    }));
    const nr = $('#noiseRange');
    setRangeFill(nr);
    nr.addEventListener('input', () => { noise = +nr.value; $('#noiseOut').textContent = noise.toFixed(2); setRangeFill(nr); });
    nr.addEventListener('change', () => { goFree(); resetEpisodes(); });
    $$('#camSeg button').forEach((b) => b.addEventListener('click', () => {
      camMode = b.dataset.cam;
      $$('#camSeg button').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      updateCamera(!eps);
    }));
    $('#batchBtn').addEventListener('click', runBatch);
    window.addEventListener('resize', () => drawAll(performance.now()));
    App.on('models', () => {
      AG.forEach((a) => { if (a !== 'classic') panels[a].overlay.hidden = App.models.ready; });
      if (!running) { eps = null; finishedRun = false; AG.forEach((k) => setStatus(k, { ico: '⏸', html: 'Готова к запуску' })); }
      updateRunBtn(); updateCamera(!eps); drawAll(performance.now());
    });
    App.on('training', (txt) => { AG.forEach((a) => { if (a !== 'classic' && !App.models.ready) panels[a].overlay.textContent = txt; }); });
    App.on('rules', () => { if (!running) updateCamera(!eps); });
    setStep(0);
  }
  return { init };
})();
