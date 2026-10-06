/* =====================================================================
   c0/ui-c0.js — проверка части 0: задания вперемешку по урокам 0.1–0.4.
   Типы: выбор ответа, «что произойдёт», порядок, задача на сцене (ПД-регулятор
   на движке shared/arm-core.js). В конце — балл по урокам и что повторить.
   Варианты перемешиваются при каждом открытии. Итог пишется в #quizScore
   («Итог: X из N»), его подхватывает анонимная статистика; пройденная
   проверка отмечается в прогрессе (mr-progress), как дочитанный урок.
   ===================================================================== */
(function () {
  'use strict';
  const K = window.HeroKit, A = window.Arm;
  const LESSON = { '0.1': ['Две парадигмы: правила и данные', '0-1-dve-paradigmy.html'], '0.2': ['Устройство робота: приводы и сенсоры', '0-2-ustroystvo-robota.html'],
    '0.3': ['Кинематика и управление', '0-3-kinematika-i-upravlenie.html'], '0.4': ['Оценка состояния и планирование', '0-4-otsenka-sostoyaniya-i-planirovanie.html'] };
  const TYPE = { choice: 'Выбор ответа', predict: 'Что произойдёт', order: 'Порядок', scene: 'Задача на сцене' };
  const Q = [
    { l: '0.1', t: 'order', q: 'Расставь модули классического стека в том порядке, в котором через них идёт информация от камеры к моторам.',
      items: ['Восприятие: найти чашку на кадре', 'Оценка состояния: уточнить, где чашка и рука', 'Планирование: построить путь руки', 'Управление: регулятор ведёт руку по пути'],
      e: 'Правила раскладывают задачу на модули: восприятие, оценка состояния, планирование, управление. Каждый модуль пишет инженер, и отказ виден на конкретном стыке.', sec: 'paradigms', st: 'Как устроена система управления робота' },
    { l: '0.2', t: 'predict', q: 'Передаточное число сустава увеличили с 6 : 1 до 100 : 1, мотор тот же. Что станет с ударом о стену на той же скорости?',
      o: ['Станет слабее: мотор крутится медленнее', 'Почти не изменится', 'Станет сильнее в несколько раз'], a: 2,
      e: 'Инерция ротора на выходе растёт как квадрат передаточного числа. В лаборатории урока удар при 100 : 1 оказался в 4,5 раза сильнее, чем при 6 : 1.', sec: 'gear', st: 'Редуктор и удар' },
    { l: '0.3', t: 'choice', q: 'Рука вытянута почти прямо. Что с ней происходит?',
      o: ['Она у сингулярности: вдоль руки захват почти не может двигаться', 'Она одинаково легко двигается во все стороны', 'У обратной задачи появляется бесконечно много решений'], a: 0,
      e: 'Эллипс скоростей сплющивается в отрезок, а определитель якобиана стремится к нулю: рука теряет направление движения.', sec: 'jac', st: 'Куда рука двигается легко' },
    { l: '0.4', t: 'choice', q: 'Ада включилась в одной из двух одинаковых спален. Какой метод удержит обе гипотезы, пока она не выедет в коридор?',
      o: ['Фильтр Калмана', 'Фильтр частиц', 'Одометрия по колёсам'], a: 1,
      e: 'Фильтр Калмана хранит одно гауссово распределение. Частицы держат несколько гипотез сразу и переживают неоднозначность.', sec: 'particles', st: 'Где Ада: фильтр частиц' },
    { l: '0.1', t: 'predict', q: 'Робот на правилах находит красную чашку при дневном свете. Вечером на кухне включили тёплый свет. Что произойдёт?',
      o: ['Правило учтёт освещение, и робот найдёт чашку', 'Правило восприятия перестанет срабатывать, и робот не найдёт чашку', 'Робот найдёт чашку, но медленнее'], a: 1,
      e: 'Порог «красный канал больше 0,60» подобрали днём. Тёплый свет опустил красный канал чашки, и правило перестало срабатывать. Это слабость правил в открытом мире.', sec: 'lab1', st: 'Три версии Ады, одна задача' },
    { l: '0.2', t: 'order', q: 'Расставь контуры от самого медленного к самому быстрому.',
      items: ['Модель, которая понимает команду и решает, что делать', 'Политика, которая выдаёт цели суставам', 'Регулятор положения сустава', 'Контур тока мотора'],
      e: 'Чем ниже этаж, тем быстрее он реагирует: от единиц герц у модели, которая понимает речь, до десятков килогерц у контура тока. Политика работает на 10–200 Гц.', sec: 'ladder', st: 'Лестница частот' },
    { l: '0.3', t: 'predict', q: 'Камера ошиблась на 4 см: стол кажется ниже. Жёсткая позиционная рука и импедансная рука с умеренной жёсткостью опускают тряпку к одной и той же ошибочной цели. Что будет?',
      o: ['Обе прижмут тряпку одинаково', 'Позиционная ударит стол намного сильнее', 'Импедансная ударит сильнее: она мягче и сильнее разгоняется'], a: 1,
      e: 'Импеданс превращает ошибку восприятия в умеренную силу: сила примерно равна жёсткости, умноженной на ошибку. Жёсткий позиционный регулятор давит, пока не дойдёт до цели.', sec: 'imp', st: 'Импеданс: как сильно давить' },
    { l: '0.4', t: 'predict', q: 'Одометрия уводит курс на 2° за метр пути, а карту строят по одометрии без коррекции. Что будет с картой после объезда дома?',
      o: ['Стены поплывут и раздвоятся', 'Карта станет бледнее, но останется верной', 'Ничего: два градуса — это мало'], a: 0,
      e: 'Карта и поза зависят друг от друга. Без коррекции позы стены раздваиваются, поэтому позу поправляют по самой карте — это SLAM.', sec: 'slam', st: 'Карта по лидару и SLAM' },
    { l: '0.1', t: 'choice', q: 'Бирюзовых чашек не было ни в правилах, ни в данных. Чем отказ нейросети отличается от отказа правил?',
      o: ['Правила говорят «не вижу» и останавливаются, а сеть уверенно едет не туда', 'Обе версии останавливаются и зовут человека', 'Сеть останавливается, а правила едут не туда'], a: 0,
      e: 'Громкий отказ правил можно поймать и позвать человека. Тихий отказ сети опаснее: она не знает, что ошиблась.', sec: 'lab1', st: 'Три версии Ады, одна задача' },
    { l: '0.2', t: 'choice', q: 'Зачем роботу модель привода, обученная по данным?',
      o: ['Чтобы мотор меньше грелся под нагрузкой', 'Чтобы симулятор точнее повторял настоящий привод', 'Чтобы обойтись без датчиков положения'], a: 1,
      e: 'Разрыв между симулятором и роботом часто начинается с привода: задержка, трение, насыщение момента. Сеть, обученная на записях настоящего привода, заменяет в симуляторе идеальную модель.', sec: 'model', st: 'Модель привода по данным' },
    { l: '0.3', t: 'choice', q: 'Чем MPC отличается от плана, построенного один раз на всю поездку?',
      o: ['Строит один план, но точнее', 'Обходится без модели робота', 'Строит план на горизонт и пересчитывает его на каждом шаге'], a: 2,
      e: 'Скользящий горизонт: план на несколько секунд вперёд, исполняется только начало, потом план строится заново из нового состояния.', sec: 'mpc', st: 'Скользящий горизонт' },
    { l: '0.4', t: 'choice', q: 'Когда A* раскрывает почти столько же клеток, сколько алгоритм Дейкстры?',
      o: ['На открытой карте без препятствий', 'Когда стена стоит поперёк прямой к цели и эвристика ведёт в тупик', 'Никогда: эвристика всегда экономит работу'], a: 1,
      e: 'Эвристика не знает о стенах. В ловушке буквой П A* раскрывает почти всю область, как и Дейкстра.', sec: 'astar', st: 'Дейкстра и A* на одной карте' },
    { l: '0.4', t: 'choice', q: 'Нужно найти путь руки с семью суставами в обход полки. Что выбрать?',
      o: ['Сетку в пространстве суставов и A*', 'RRT или RRT*', 'Фильтр частиц'], a: 1,
      e: 'При 50 клетках на ось у семи суставов 50⁷ клеток — сетка не помещается в память. Случайные деревья ищут путь без сетки.', sec: 'dims', st: 'Почему сетка не годится для руки' },
    { l: '0.3', t: 'scene', q: 'Подними чашку к полке ПД-регулятором. Подбери Kp, Kd и компенсацию гравитации так, чтобы захват встал у полки точнее 1 см, рука успокоилась быстрее 1,2 с, а Kp был не больше 120.',
      e: 'При конечном Kp пружине нужно растянуться, чтобы держать вес, — отсюда провис. Компенсация гравитации снимает вес с пружины, и умеренного Kp хватает. Kd гасит раскачку: слишком маленький оставляет колебания, слишком большой делает движение вязким.', sec: 'pd', st: 'Регулятор: пружина и демпфер' },
  ];
  const N = Q.length, res = new Array(N).fill(null);
  const slug = (location.pathname.split('/').pop() || '').replace(/\.html$/, '');
  const stat = (name) => { if (window.MRStats) window.MRStats.ev(name); };
  const shuffle = (n) => { const o = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; };
  const link = (q) => `<a href="${LESSON[q.l][1]}#${q.sec}">Раздел «${q.st}» урока ${q.l} →</a>`;

  function done(k, ok, card) {
    if (res[k] !== null) return;
    res[k] = ok; stat(`chk:${k + 1}:${ok ? 'ok' : 'no'}`);
    const q = Q[k], exp = card.querySelector('.chk-exp');
    exp.innerHTML = `<b>${ok ? 'Верно.' : 'Не совсем.'}</b> ${q.e} ${link(q)}`; exp.hidden = false;
    card.classList.add(ok ? 'right' : 'wrong');
    summary();
  }

  function choice(k, card) {
    const q = Q[k], box = h('div', { class: 'chk-opts' });
    shuffle(q.o.length).forEach((oi) => {
      const b = h('button', { type: 'button', class: 'chk-opt' }, q.o[oi]);
      b.addEventListener('click', () => {
        if (res[k] !== null) return;
        const ok = oi === q.a; b.classList.add(ok ? 'ok' : 'no');
        if (!ok) [...box.children].find((x) => x.textContent === q.o[q.a]).classList.add('ok');
        [...box.children].forEach((x) => { x.disabled = true; });
        done(k, ok, card);
      });
      box.append(b);
    });
    return box;
  }

  function order(k, card) {
    const q = Q[k], box = h('div', { class: 'chk-order' }), picked = [];
    const list = h('div', { class: 'chk-opts' }), reset = h('button', { type: 'button', class: 'g-restart' }, 'Начать порядок заново');
    const btns = shuffle(q.items.length).map((ii) => {
      const b = h('button', { type: 'button', class: 'chk-opt' }, h('span', { class: 'chk-n' }), q.items[ii]);
      b.addEventListener('click', () => {
        if (res[k] !== null || picked.includes(ii)) return;
        picked.push(ii); b.classList.add('picked'); b.querySelector('.chk-n').textContent = picked.length;
        if (picked.length === q.items.length) {
          const ok = picked.every((v, i) => v === i);
          btns.forEach((x) => { x.disabled = true; x.classList.add(+x.dataset.ii === picked.indexOf(+x.dataset.ii) ? 'ok' : 'no'); });
          if (!ok) card.querySelector('.chk-exp').before(h('p', { class: 'chk-right' }, 'Верный порядок: ' + q.items.map((t, i) => `${i + 1}. ${t.split(':')[0]}`).join(' → ')));
          reset.hidden = true; done(k, ok, card);
        }
      });
      b.dataset.ii = ii; list.append(b); return b;
    });
    reset.addEventListener('click', () => { picked.length = 0; btns.forEach((x) => { x.classList.remove('picked'); x.querySelector('.chk-n').textContent = ''; }); });
    box.append(h('p', { class: 'chk-hint' }, 'Нажимай варианты по порядку: первый, второй и так далее.'), list, reset);
    return box;
  }

  /* ---------- задача на сцене: ПД-регулятор поднимает чашку к полке ---------- */
  function scene(k, card) {
    const W = 520, H = 330, PW = 520, PH = 120, S = 200, O = { x: 170, y: 128 };
    const st = { Kp: 60, Kd: 0, comp: false, run: null, t: 0, busy: false };
    const cv = h('canvas', { class: 'chk-cv', role: 'img', 'aria-label': 'Рука в вертикальной плоскости поднимает чашку к полке' });
    const pl = h('canvas', { class: 'chk-plot', role: 'img', 'aria-label': 'График: ошибка положения захвата во времени' });
    const range = (label, key, min, max, step) => {
      const inp = h('input', { type: 'range', min, max, step, value: st[key] }), out = h('output', null, String(st[key]));
      inp.addEventListener('input', () => { st[key] = +inp.value; out.textContent = inp.value; crit(); });
      return h('label', { class: 'hd-range' }, h('span', null, label), inp, out);
    };
    const comp = h('input', { type: 'checkbox' }); comp.addEventListener('change', () => { st.comp = comp.checked; });
    const go = h('button', { type: 'button', class: 'btn primary' }, 'Поднять чашку');
    const skip = h('button', { type: 'button', class: 'g-restart' }, 'Пропустить задачу');
    const out = h('div', { class: 'readout' }, 'Регулятор тянет суставы к углам, при которых чашка оказывается у полки.');
    const crits = [['err', 'Захват у полки точнее 1 см'], ['ts', 'Рука успокоилась быстрее 1,2 с'], ['kp', 'Kp не больше 120']].map(([id, t]) => h('li', { class: 'wait', 'data-c': id }, h('i', { 'aria-hidden': 'true' }), h('span', null, t)));
    const ul = h('ul', { class: 'm-crit live' }, crits);
    const ctl = h('div', { class: 'chk-ctl' }, range('Kp', 'Kp', 20, 400, 10), range('Kd', 'Kd', 0, 40, 1), h('label', { class: 'toggle' }, comp, h('span', { class: 'box' }), 'Компенсация гравитации'));
    const wrap = h('div', { class: 'chk-scene' }, cv, pl, ctl, h('div', { class: 'chk-row' }, go, skip), out, ul);
    const P = () => ({ bg: K.css('--surface-2'), ink: K.css('--ink'), ink3: K.css('--ink-3'), line: K.css('--line-2'), e2e: K.css('--e2e'), good: K.css('--good'), classic: K.css('--classic') });
    const map = (x, y) => [O.x + x * S, O.y - y * S];
    function measure(r) {
      const f = r.frames, fin = f[f.length - 1].err; let ts = 0;
      for (let i = f.length - 1; i >= 0; i--) if (Math.abs(f[i].err - fin) > 0.01) { ts = f[i].t; break; }
      return { fin, ts };
    }
    function crit(m) {
      const set = (id, ok) => { const li = crits.find((x) => x.dataset.c === id); li.className = ok == null ? 'wait' : ok ? 'ok' : 'no'; };
      set('kp', st.Kp <= 120);
      if (m) { set('err', m.fin < 0.01); set('ts', m.ts < 1.2); }
    }
    function draw() {
      const { c, k: kk } = K.fit(cv, W, H), p = P();
      c.fillStyle = p.bg; c.fillRect(0, 0, W, H);
      const fr = st.run ? st.run.frames[Math.min(st.run.frames.length - 1, Math.floor(st.t / 0.01))] : null;
      const q = fr ? fr.q : A.ctlInit('pd').q, s = A.SHELF;
      // полка и цель
      const [sx, sy] = map(s.x - 0.06, s.y - 0.035), [ex] = map(s.x + 0.35, 0);
      c.fillStyle = p.line; c.fillRect(sx, sy, ex - sx, 8 * kk);
      const [tx, ty] = map(s.x, s.y);
      c.setLineDash([4 * kk, 4 * kk]); c.strokeStyle = p.good; c.lineWidth = 1.6 * kk; c.beginPath(); c.arc(tx, ty, 0.01 * S + 6 * kk, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      // основание и рука
      const f = A.fk(q), [x0, y0] = map(0, 0), [x1, y1] = map(f.x1, f.y1), [x2, y2] = map(f.x, f.y);
      c.fillStyle = p.ink3; c.fillRect(x0 - 16 * kk, y0, 32 * kk, 12 * kk);
      c.lineCap = 'round'; c.strokeStyle = p.ink; c.lineWidth = 9 * kk; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineTo(x2, y2); c.stroke();
      for (const [x, y] of [[x0, y0], [x1, y1]]) { c.fillStyle = p.bg; c.beginPath(); c.arc(x, y, 4.5 * kk, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = p.e2e; c.beginPath(); c.roundRect(x2 - 8 * kk, y2 - 13 * kk, 16 * kk, 13 * kk, 3 * kk); c.fill();
      K.label(c, kk, 'полка', tx + 40 * kk, sy - 10 * kk, { px: 12, color: p.ink3 });
      if (fr) K.label(c, kk, `t = ${fr.t.toFixed(2).replace('.', ',')} с · ошибка ${(fr.err * 100).toFixed(1).replace('.', ',')} см`, W / 2, 16 * kk, { px: 12, mono: true, color: p.ink3 });
    }
    function plot() {
      const { c, k: kk } = K.fit(pl, PW, PH), p = P(), T = 4, Y = 0.3;
      c.fillStyle = p.bg; c.fillRect(0, 0, PW, PH);
      const X = (t) => 34 + t / T * (PW - 44), Yp = (e) => 10 + (1 - Math.min(e, Y) / Y) * (PH - 30);
      c.fillStyle = 'color-mix(in srgb, ' + p.good + ' 18%, transparent)'; c.fillRect(X(0), Yp(0.01), X(T) - X(0), Yp(0) - Yp(0.01));
      c.strokeStyle = p.line; c.lineWidth = 1 * kk; c.beginPath(); c.moveTo(X(0), Yp(0)); c.lineTo(X(T), Yp(0)); c.stroke();
      for (const t of [0, 1, 2, 3, 4]) K.label(c, kk, t + ' с', X(t), PH - 8 * kk, { px: 11, mono: true, color: p.ink3 });
      K.label(c, kk, '30 см', 4 * kk, Yp(Y) + 4 * kk, { px: 11, mono: true, color: p.ink3, align: 'left' });
      if (!st.run) return;
      c.strokeStyle = p.e2e; c.lineWidth = 2 * kk; c.beginPath();
      st.run.frames.forEach((f, i) => { if (f.t <= st.t + 1e-9) { if (i) c.lineTo(X(f.t), Yp(f.err)); else c.moveTo(X(f.t), Yp(f.err)); } });
      c.stroke();
    }
    function play() {
      st.busy = true; go.disabled = true; const t0 = performance.now();
      const step = () => {
        st.t = Math.min(4, (performance.now() - t0) / 1000 * (matchMedia('(prefers-reduced-motion: reduce)').matches ? 8 : 1.6));
        draw(); plot();
        if (st.t < 4) requestAnimationFrame(step); else finish();
      };
      requestAnimationFrame(step);
    }
    function finish() {
      st.busy = false; go.disabled = res[k] !== null;
      const m = measure(st.run); crit(m);
      out.textContent = `Ошибка в конце: ${(m.fin * 100).toFixed(1).replace('.', ',')} см · рука успокоилась к ${m.ts.toFixed(2).replace('.', ',')} с · Kp ${st.Kp}, Kd ${st.Kd}${st.comp ? ', с компенсацией гравитации' : ''}.`;
      if (m.fin < 0.01 && m.ts < 1.2 && st.Kp <= 120) { skip.hidden = true; go.disabled = true; done(k, true, card); }
    }
    go.addEventListener('click', () => { if (st.busy || res[k] !== null) return; st.run = A.simulate({ mode: 'pd', Kp: st.Kp, Kd: st.Kd, comp: st.comp }, 4); st.t = 0; play(); });
    skip.addEventListener('click', () => {
      if (res[k] !== null || st.busy) return;
      skip.hidden = true; go.disabled = true;
      card.querySelector('.chk-exp').before(h('p', { class: 'chk-right' }, 'Например, подходит компенсация гравитации, Kp 80 и Kd 10.'));
      done(k, false, card);
    });
    crit(); draw(); plot();
    App.on('theme', () => { draw(); plot(); }); App.on('resize', () => { draw(); plot(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { draw(); plot(); }); // подписи на холсте — после загрузки шрифтов
    return wrap;
  }

  function summary() {
    const n = res.filter((x) => x !== null).length, right = res.filter(Boolean).length;
    $('#chkWait').textContent = n < N ? `Отвечено ${n} из ${N}, верно ${right}. Итог появится, когда ответишь на все задания.` : '';
    if (n < N) return;
    $('#quizScore').textContent = `Итог: ${right} из ${N}. ${right >= N - 2 ? 'Часть 0 усвоена, можно идти дальше.' : 'Ниже — разделы уроков, которые стоит повторить.'}`;
    const by = {};
    Q.forEach((q, i) => { (by[q.l] = by[q.l] || [0, 0]); by[q.l][1]++; if (res[i]) by[q.l][0]++; });
    $('#chkTable').innerHTML = Object.keys(LESSON).map((l) => `<div class="chk-tr"><span>${l} ${LESSON[l][0]}</span><b>${by[l][0]} из ${by[l][1]}</b></div>`).join('');
    const wrong = Q.map((q, i) => (res[i] ? null : q)).filter(Boolean);
    $('#chkReview').innerHTML = wrong.length ? wrong.map((q) => `<li><a href="${LESSON[q.l][1]}#${q.sec}">${q.l} · ${q.st}</a><span>${q.q.length > 90 ? q.q.slice(0, 88) + '…' : q.q}</span></li>`).join('') : '<li><strong>Повторять нечего</strong><span>Все задания решены верно.</span></li>';
    $('#chkResult').hidden = false;
    try { // проверка пройдена — отметка в прогрессе, как у дочитанного урока
      const d = JSON.parse(localStorage.getItem('mr-progress') || '{}') || {}, now = Math.round(Date.now() / 1000);
      d[slug] = Object.assign(d[slug] || { s: now }, { t: now, f: (d[slug] && d[slug].f) || now });
      localStorage.setItem('mr-progress', JSON.stringify(d));
    } catch (e) { /* приватный режим */ }
  }

  function render() {
    const list = $('#chkList'); list.innerHTML = ''; res.fill(null);
    Q.forEach((q, k) => {
      const card = h('div', { class: 'card chk-card', id: 'q' + (k + 1) });
      card.append(h('div', { class: 'chk-meta' }, `Задание ${k + 1} из ${N} · ${TYPE[q.t]} · урок ${q.l}`), h('p', { class: 'chk-q' }, q.q));
      card.append(q.t === 'order' ? order(k, card) : q.t === 'scene' ? scene(k, card) : choice(k, card));
      const exp = h('div', { class: 'chk-exp' }); exp.hidden = true; card.append(exp);
      list.append(card);
    });
    $('#quizScore').textContent = ''; $('#chkResult').hidden = true; summary();
  }

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

  initTheme(); initNav(); render();
  $('#chkAgain').addEventListener('click', () => { render(); document.getElementById('tasks').scrollIntoView({ behavior: 'smooth' }); });
  window.__c0 = { Q, res };
})();
