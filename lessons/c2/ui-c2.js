/* =====================================================================
   c2/ui-c2.js — проверка части 2: задания вперемешку по урокам 2.1–2.3
   и задача на сцене «Собери систему из двух частей» на движке l21/engine.js:
   откуда брать «что» (слова из демонстраций или мини-CLIP) и «где» (регрессия
   координат или карта по клеткам), чтобы робот взял кубик нового цвета.
   Общий движок проверок — shared/check.js.
   ===================================================================== */
(function () {
  'use strict';
  const K = window.HeroKit, E = window.L21;
  const TABLE = { ink: '#0b0b0b', halo: '#fffefb', good: '#0ca30c', bad: '#d03b3b' };
  const LESSON = {
    '2.1': ['Transporter и CLIPort', '2-1-transporter-i-cliport.html'],
    '2.2': ['PerAct: 3D-представления и язык', '2-2-peract.html'],
    '2.3': ['LLM-планировщики и VoxPoser', '2-3-llm-planirovshchiki.html'],
  };
  const Q = [
    { l: '2.1', t: 'predict', q: 'Карту «где взять» обучили на одной демонстрации, где оператор берёт красный кубик. На новой сцене кубик лежит в другом углу стола. Что сделает карта?',
      o: ['Возьмёт кубик на новом месте: её фильтр одинаков во всех клетках', 'Потянется туда, где кубик был в демонстрации', 'Ничего: одной демонстрации мало'], a: 0,
      e: 'Полносвёрточная карта эквивариантна сдвигу: сдвинули кубик — сдвинулся пик карты. Регрессия координат в той же лаборатории тянулась к месту из демонстрации.', sec: 'maps', st: 'Действие — клетка на картинке' },
    { l: '2.1', t: 'choice', q: 'Как CLIP находит предмет по описанию, которого не было в его обучении?',
      o: ['Вектор описания складывается из векторов слов, а признаки картинки он кодирует по отдельности', 'Он запоминает все картинки из интернета', 'Он дообучается на каждом новом описании'], a: 0,
      e: 'Контрастное обучение кладёт картинки и подписи в одно пространство. Новое сочетание знакомых признаков попадает туда, куда указывает сумма слов: так мини-CLIP нашёл фиолетовый кубик.', sec: 'words', st: 'Картинки и подписи в одном пространстве' },
    { l: '2.1', t: 'predict', q: 'На столе два одинаковых кубика. Регрессия координат и карта обучены на демонстрациях, где оператор брал то один, то другой. Куда попадёт регрессия?',
      o: ['Между кубиками, в пустое место', 'В один из кубиков', 'В тот кубик, что ближе к роботу'], a: 0,
      e: 'Регрессия выдаёт среднее, а среднее двух кубиков — пустое место между ними. У карты два пика, и робот берёт один из них.', sec: 'maps', st: 'Действие — клетка на картинке' },
    { l: '2.1', t: 'choice', q: 'Как Transporter находит поворот, под которым деталь войдёт в гнездо?',
      o: ['Строит карты для 36 повёрнутых копий вырезки и берёт лучшую клетку среди всех', 'Предсказывает угол регрессией', 'Пробует повороты на роботе, пока деталь не войдёт'], a: 0,
      e: 'Поворот — ещё одна ось карты. Поворот гнезда превращается в сдвиг пика по этой оси, и обучать сеть заново не нужно.', sec: 'place', st: 'Куда положить: поиск по шаблону' },
    { l: '2.2', t: 'choice', q: 'Чем карта действий PerAct отличается от карты Transporter?',
      o: ['Она трёхмерная: оценка есть у каждого вокселя над столом, поэтому верхнюю и нижнюю полку можно различить', 'Она такая же, как у Transporter, только строится по четырём камерам', 'Она выдаёт координаты захвата регрессией, а не клетку на карте'], a: 0,
      e: 'Сверху верхняя и нижняя полки — один пиксель, и карта стола их не различает. В сетке 100 × 100 × 100 у каждой высоты свой воксель, а поворот захвата выбирают по трём осям.', sec: 'idea', st: 'От точки на столе к позе в объёме' },
    { l: '2.2', t: 'choice', q: 'Почему PerAct выдаёт только следующую ключевую позу, а не действие на каждом кадре?',
      o: ['Решений становится единицы вместо сотен, и ошибкам негде копиться; путь между позами строит планировщик движения', 'Сеть слишком медленная, чтобы выдавать действие на каждом кадре', 'Камеры снимают сцену только в ключевых позах'], a: 0,
      e: 'Ключевая поза — кадр, где рука стоит, а захват не меняет состояние. В лаборатории из 325 решений осталось шесть: подход, захват, подъём над чайником, место перед полкой, отпускание и отвод руки.', sec: 'keyframes', st: 'Ключевые позы вместо траектории' },
    { l: '2.2', t: 'predict', q: 'Демонстрации ставят чашку то на верхнюю, то на нижнюю полку, а команда — просто «поставь чашку на полку». Что выдаст классификатор вокселей?',
      o: ['Два пика, по одному на каждой полке, и выберет один из них', 'Один пик посередине между полками', 'Ровную карту: без названия полки он ничего не выучит'], a: 0,
      e: 'Классификатор хранит распределение по вокселям и не усредняет верные ответы. Регрессия в той же лаборатории поставила чашку в воздух между полками. Команда с названием полки оставляет один пик.', sec: 'voxels', st: 'Следующий лучший воксель' },
    { l: '2.2', t: 'choice', q: 'Зачем PerAct нужен Perceiver, если есть обычный трансформер?',
      o: ['Внимание всех ко всем по 8077 токенам не помещается в память при обучении, а через 2048 латентов стоимость растёт линейно по числу токенов', 'Perceiver лучше понимает текст команды, потому что обучен вместе с CLIP', 'Обычный трансформер не умеет работать с трёхмерными данными'], a: 0,
      e: 'Кросс-внимание переносит вход в латенты, и внимание всех ко всем идёт только между ними. В лаборатории оценки внимания всех ко всем по патчам заняли 25 ГБ, у Perceiver — 3,7 ГБ.', sec: 'perceiver', st: 'Миллион вокселей и 2048 латентов' },
    { l: '2.3', t: 'predict', q: 'Просьба — «принеси чашку из шкафа», шкаф закрыт. Полезность от языковой модели: «взять чашку из шкафа» — 0,5, «открыть шкаф» — 0,1. Выполнимость от функций ценности: 0,04 и 0,9. Какой шаг выберет SayCan?',
      o: ['«Открыть шкаф»: 0,1 × 0,9 = 0,09 больше, чем 0,5 × 0,04 = 0,02', '«Взять чашку из шкафа»: у него выше полезность', 'Никакой: первый шаг рецепта невыполним, и план остановится'], a: 0,
      e: 'SayCan перемножает «полезно» и «выполнимо сейчас». Шаг, которого нет в рецепте, попадает в план, потому что без него рецепт не выполнить.', sec: 'saycan', st: 'SayCan: полезно и выполнимо' },
    { l: '2.3', t: 'predict', q: 'SayCan работает без обратной связи. Ада берёт чашку, но та выскальзывает из захвата. Что будет дальше?',
      o: ['План пойдёт дальше, будто чашка в захвате: языковая модель считает шаг выполненным', 'SayCan повторит взятие: функция ценности увидит, что захват пуст', 'Ада остановится и спросит человека'], a: 0,
      e: 'Языковая модель видит только просьбу и список выбранных шагов. Inner Monologue дописывает в подсказку строку детектора успеха, и модель повторяет сорвавшийся шаг.', sec: 'monologue', st: 'Inner Monologue: результат шага — словами' },
    { l: '2.3', t: 'choice', q: 'Команда — «подвинь кубик немного левее». Почему SayCan с ней не справится, а Code as Policies справится?',
      o: ['SayCan выбирает только из обученных навыков, а программа сама посчитает новую координату и вызовет «взять и положить»', 'Code as Policies обучен на демонстрациях сдвигов, а SayCan — нет', 'SayCan не понимает слово «левее», а модель для кода понимает'], a: 0,
      e: 'Под каждую формулировку навык не обучишь. Модель, обученная на коде, превращает «немного левее» в число: в примерах статьи «немного вправо» становится прибавкой 0,1 к координате x.', sec: 'code', st: 'Code as Policies: модель пишет программу' },
    { l: '2.3', t: 'order', q: 'Расставь по порядку, как VoxPoser выполняет просьбу «открой верхний ящик и не задень вазу».',
      items: ['Языковая модель пишет код по просьбе', 'Код вызывает детекторы, и они находят ручку и вазу по названию', 'Код заполняет карты притяжения к ручке и избегания вокруг вазы', 'Планировщик ищет путь захвата с наименьшей стоимостью по взвешенной сумме карт', 'Робот делает шаг по пути, и путь пересчитывают по свежему изображению'],
      e: 'Языковая модель решает, к чему тянуться и чего избегать, но не выдаёт ни одной точки пути. Путь строит планировщик и пересчитывает его 5 раз в секунду, а код при этом исполняют заново со свежими ответами детекторов, не спрашивая модель.', sec: 'voxposer', st: 'VoxPoser: код строит карту, планировщик — путь' },
    { l: '2.1', t: 'scene', q: 'Команда — «возьми фиолетовый кубик», а в демонстрациях робота были только красный, синий и зелёный. Собери систему из двух частей: откуда брать «что» и откуда «где», чтобы робот взял названный кубик хотя бы в 18 сценах из 20.',
      e: 'Регрессия координат не справляется даже со знакомыми цветами: ей нужно выучить, как каждое положение превращается в числа. Карта по клеткам находит кубики, но цвет «фиолетовый» ей может подсказать только мини-CLIP: фильтры слов из демонстраций знают лишь красный, синий и зелёный. Так устроен CLIPort.', sec: 'cliport', st: 'CLIPort: CLIP выбирает, что взять, Transporter — где' },
  ];

  /* ---------- задача на сцене: «что» и «где» ---------- */
  function scene(api) {
    const W = 440, NS = 20, st = { what: 'robot', where: 'reg', busy: false, res: null, cur: 0 };
    let M = null;
    const cv = h('canvas', { class: 'chk-cv sq', role: 'img', 'aria-label': 'Стол сверху: три кубика и миска, отмечено, где робот берёт' });
    const segWhat = h('div', { class: 'seg', role: 'group', 'aria-label': 'Что' }, h('button', { type: 'button', 'data-v': 'robot', 'aria-pressed': 'true' }, 'Слова из демонстраций'), h('button', { type: 'button', 'data-v': 'clip', 'aria-pressed': 'false' }, 'Мини-CLIP'));
    const segWhere = h('div', { class: 'seg', role: 'group', 'aria-label': 'Где' }, h('button', { type: 'button', 'data-v': 'reg', 'aria-pressed': 'true' }, 'Регрессия координат'), h('button', { type: 'button', 'data-v': 'map', 'aria-pressed': 'false' }, 'Карта по клеткам'));
    const go = h('button', { type: 'button', class: 'btn primary' }, 'Проверить на 20 сценах');
    const skip = h('button', { type: 'button', class: 'g-restart' }, 'Пропустить задачу');
    const out = h('div', { class: 'readout' }, 'Робот обучен на девяти демонстрациях с красным, синим и зелёным кубиками. Выбери обе части и запусти проверку.');
    const crit = h('li', { class: 'wait' }, h('i', { 'aria-hidden': 'true' }), h('span', null, 'Названный кубик взят хотя бы в 18 сценах из 20'));
    const wrap = h('div', { class: 'chk-scene' }, cv,
      h('div', { class: 'chk-ctl' }, h('span', { class: 'chk-lab' }, 'Что:'), segWhat), h('div', { class: 'chk-ctl' }, h('span', { class: 'chk-lab' }, 'Где:'), segWhere),
      h('div', { class: 'chk-row' }, go, skip), out, h('ul', { class: 'm-crit live' }, crit));
    const sync = () => { $$('button', segWhat).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === st.what))); $$('button', segWhere).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === st.where))); };
    const wait = () => new Promise((r) => requestAnimationFrame(() => r()));
    async function run(gen, per) { for (;;) { let r; for (let i = 0; i < (per || 4); i++) { r = gen.next(); if (r.done) return r.value; } await wait(); } }
    /** Модели обучаются при первой проверке: мини-CLIP, фильтр «где», фильтры слов и две регрессии. */
    async function models() {
      if (M) return M;
      const cl = E.clipInit(7); out.textContent = 'Обучаю мини-CLIP на парах «картинка — подпись»…'; await run(E.clipTrain(cl, { seed: 7 }), 1);
      const demos = E.cmdDemos(9, 300);
      out.textContent = 'Обучаю карту и регрессию на девяти демонстрациях робота…';
      const where = await run(E.pickTrain(E.pickInit(4), demos)), cond = await run(E.condTrain(demos));
      const vec = (src, word) => (src === 'clip' ? Array.from(E.embedText(cl, E.tokens(word, 'cube'))) : E.SEEN.map((w) => (w === word ? 1 : 0)).concat(new Array(13).fill(0)));
      const reg = {};
      for (const src of ['robot', 'clip']) {
        const m = E.net([E.G * E.G * 3 + 16, 32, 2], 9), g = new Float64Array(2);
        for (let it = 0; it < 300; it++) {
          for (const d of demos) { const x = Float64Array.from([...d.grid, ...vec(src, d.word)]), t = E.cellXY(d.target), y = E.fwd(m, x); g[0] = 2 * (y[0] - (t.x / E.TW * 2 - 1)); g[1] = 2 * (y[1] - (t.y / E.TW * 2 - 1)); E.bwd(m, g); }
          E.adam(m, 0.003, demos.length); if (it % 30 === 0) await wait();
        }
        reg[src] = (sc, word) => { const y = E.fwd(m, Float64Array.from([...sc.grid, ...vec(src, word)])); return { x: (y[0] + 1) / 2 * E.TW, y: (y[1] + 1) / 2 * E.TW }; };
      }
      return (M = { cl, where, cond, reg });
    }
    function pick(sc) {
      if (st.where === 'reg') return M.reg[st.what](sc, 'purple');
      const s = st.what === 'robot' ? E.condScores(M.cond, sc.grid, 'purple') : E.fuse(E.pickScores(M.where, sc.grid), E.whatMap(M.cl, sc.img, E.tokens('purple', 'cube')));
      return E.cellXY(E.argmax(s));
    }
    function draw() {
      const { c, k } = K.fit(cv, W, W), bg = K.css('--surface-2');
      c.fillStyle = bg; c.fillRect(0, 0, W, W);
      const sc = st.res ? st.res.scenes[st.cur] : E.cmdScene('purple', 900);
      const bm = document.createElement('canvas'); bm.width = E.TW; bm.height = E.TW;
      const bc = bm.getContext('2d'), d = bc.createImageData(E.TW, E.TW);
      for (let i = 0; i < E.TW * E.TW; i++) { d.data[i * 4] = sc.img[i * 3] * 255; d.data[i * 4 + 1] = sc.img[i * 3 + 1] * 255; d.data[i * 4 + 2] = sc.img[i * 3 + 2] * 255; d.data[i * 4 + 3] = 255; }
      bc.putImageData(d, 0, 0); c.imageSmoothingEnabled = false; c.drawImage(bm, 0, 0, W, W);
      // стол всегда светлый, поэтому подписи на нём в цветах светлой темы и не выходят за край
      const tag = (text, x, y, color) => { K.font(c, k, 12, 700); const w = c.measureText(text).width / 2 + 6 * k; K.label(c, k, text, Math.max(w, Math.min(W - w, x)), y, { px: 12, weight: 700, color, haloColor: TABLE.halo }); };
      if (st.res) { const r = st.res.picks[st.cur], s2 = W / E.TW, col = r.ok ? TABLE.good : TABLE.bad; c.beginPath(); c.arc(r.p.x * s2, r.p.y * s2, 17, 0, 7); c.lineWidth = 3.2; c.strokeStyle = col; c.stroke(); tag(r.ok ? 'взял названный кубик' : 'взял не то', r.p.x * s2, r.p.y * s2 - 28, col); }
      tag('«возьми фиолетовый кубик»', W / 2, 16, TABLE.ink);
    }
    go.addEventListener('click', async () => {
      if (st.busy || api.isDone()) return;
      st.busy = true; go.disabled = true; await models();
      const scenes = [], picks = []; let ok = 0;
      for (let i = 0; i < NS; i++) { const sc = E.cmdScene('purple', 900 + i), p = pick(sc), hit = E.hitObj(sc.target, p.x, p.y); scenes.push(sc); picks.push({ p, ok: hit }); if (hit) ok++; }
      st.res = { scenes, picks, ok }; st.cur = picks.findIndex((x) => !x.ok); if (st.cur < 0) st.cur = 0;
      st.busy = false; go.disabled = false; draw();
      const name = `«что» — ${st.what === 'clip' ? 'мини-CLIP' : 'слова из демонстраций'}, «где» — ${st.where === 'map' ? 'карта по клеткам' : 'регрессия координат'}`;
      out.textContent = `${name}: названный кубик взят в ${ok} сценах из ${NS}. На сцене — ${st.res.picks[st.cur].ok ? 'одна из сцен' : 'сцена с ошибкой'}.`;
      crit.className = ok >= 18 ? 'ok' : 'no';
      if (ok >= 18) { skip.hidden = true; go.disabled = true; api.done(true); }
    });
    segWhat.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !st.busy) { st.what = b.dataset.v; sync(); } });
    segWhere.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !st.busy) { st.where = b.dataset.v; sync(); } });
    skip.addEventListener('click', () => {
      if (api.isDone() || st.busy) return;
      skip.hidden = true; go.disabled = true;
      api.hint('Подходят карта по клеткам и мини-CLIP: карта находит кубики в любом месте стола, а цвет, которого не было в демонстрациях, знает только CLIP.');
      api.done(false);
    });
    sync(); draw();
    App.on('theme', draw); App.on('resize', draw);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
    return wrap;
  }

  const n = Q.length; const cnt = document.getElementById('chkCount'); if (cnt) cnt.textContent = `${n - 1} ${plural(n - 1, 'вопрос', 'вопроса', 'вопросов')} и задача на сцене`;
  PartCheck({ lessons: LESSON, questions: Q, scene, passText: 'Часть 2 усвоена, можно идти дальше.', expose: '__c2' });
})();
