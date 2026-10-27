/* =====================================================================
   l66/engine.js — движок урока 6.6 «Обзор гуманоидных платформ». Без DOM:
   в браузере — window.L66, в Node — require. Без случайности и без
   вычислений с плавающей точкой: только данные таблицы и проверки отметок.

   Лаборатория «Сравнительная таблица архитектур»: строки — платформы и Ада,
   колонки — по три на каждую из четырёх осей урока (управление, данные, тело,
   применение). У каждой ячейки короткий текст, метка и источник:
     nn  — обучено на данных (нейросеть),     cl — написано и настроено людьми,
     mix — и то и другое,                     yes / no — есть / нет,
     na  — не опубликовано.
   Все факты — из досье sources/dossier/6.6-obzor-platform.md (там адреса,
   даты и цитаты); ячейки Ады — из уроков 6.1–6.5.

   Миссии задают вопрос-ситуацию («робота толкнули», «пропала сеть»…). Ответ
   на вопрос — множество строк, которое правило вопроса выводит из меток ячеек;
   тест урока сверяет правило с ответом и с текстами разборов.
   ===================================================================== */
'use strict';
(function (root) {
  const AXES = [
    { id: 'ctl', label: 'Управление', cols: ['top', 'low', 'where'] },
    { id: 'data', label: 'Данные', cols: ['teleop', 'human', 'sim'] },
    { id: 'body', label: 'Тело', cols: ['act', 'hand', 'batt'] },
    { id: 'use', label: 'Применение', cols: ['site', 'price', 'show'] },
  ];
  const COLS = {
    top: { label: 'Верхний уровень', sub: 'модель, которая понимает сцену и задачу' },
    low: { label: 'Нижний уровень', sub: 'что держит равновесие' },
    where: { label: 'Верхний уровень на борту?', sub: 'где он считается' },
    teleop: { label: 'Телеоперация', sub: 'записи оператора' },
    human: { label: 'Люди', sub: 'видео и записи движений людей' },
    sim: { label: 'Симуляция', sub: 'обучение в симуляторе' },
    act: { label: 'Приводы', sub: 'что двигает суставы' },
    hand: { label: 'Кисть', sub: 'приводы, датчики' },
    batt: { label: 'Батарея', sub: 'время работы, замена' },
    site: { label: 'Где работает', sub: 'у кого и на какой задаче' },
    price: { label: 'Цена', sub: 'если объявлена' },
    show: { label: 'Показы', sub: 'что известно о самостоятельности' },
  };
  const MARK = { nn: 'обучено на данных', cl: 'написано и настроено людьми', mix: 'и то и другое', yes: 'есть', no: 'нет', na: 'не опубликовано' };
  const AXIS_OF = {}; AXES.forEach((a) => a.cols.forEach((c) => { AXIS_OF[c] = a.id; }));

  /* ---------- источники (подробно — в досье) ---------- */
  const SRC = {
    helix02: { t: 'Figure, «Helix 02»', d: '27.01.2026', u: 'https://www.figure.ai/news/helix-02' },
    helixpage: { t: 'Figure, страница Helix', d: 'прочитано 27.10.2026', u: 'https://www.figure.ai/helix' },
    helixlog: { t: 'Figure, «Helix Accelerating Real-World Logistics» и «Scaling Helix»', d: '26.02.2025 и 07.06.2025', u: 'https://www.figure.ai/news/scaling-helix-logistics' },
    index: { t: 'Figure, «Introducing Index»', d: '25.08.2026', u: 'https://www.figure.ai/news/introducing-index' },
    ramp: { t: 'Figure, «Ramping Figure 03 Production»', d: '29.04.2026', u: 'https://www.figure.ai/news/ramping-figure-03-production' },
    fig03: { t: 'Figure, «Introducing Figure 03»', d: '09.10.2025', u: 'https://www.figure.ai/news/introducing-figure-03' },
    figbmw: { t: 'Figure, «F.03 at BMW» и пост о Figure 02 на BMW', d: '30.06.2026 и 19.11.2025', u: 'https://www.figure.ai/news/f-03-at-bmw' },
    figsite: { t: 'Figure, сайт компании', d: 'прочитано 27.10.2026', u: 'https://www.figure.ai' },
    lbm: { t: 'Boston Dynamics и TRI, «Large Behavior Models and Atlas Find New Footing»', d: '20.08.2025', u: 'https://bostondynamics.com/blog/large-behavior-models-atlas-find-new-footing/' },
    bdhands: { t: 'Boston Dynamics, «Robot Hands for Modern AI and Real Work»', d: '01.10.2026', u: 'https://bostondynamics.com/blog/robot-hands-for-modern-ai-and-real-work/' },
    bdthor: { t: 'Boston Dynamics, «Boston Dynamics Expands Collaboration with NVIDIA»', d: '18.03.2025', u: 'https://bostondynamics.com/news/boston-dynamics-expands-collaboration-with-nvidia/' },
    bdfootball: { t: 'Boston Dynamics, «Can football teach a robot to move?»', d: '04.06.2026', u: 'https://bostondynamics.com/blog/can-football-teach-a-robot-to-move/' },
    zest: { t: 'Sleiman, Li и соавторы (RAI Institute и Boston Dynamics), «ZEST», arXiv 2602.00401', d: '30.01.2026', u: 'https://arxiv.org/abs/2602.00401' },
    bdwork: { t: 'Boston Dynamics, «Training a Humanoid Robot for Hard Work»', d: '18.05.2026', u: 'https://bostondynamics.com/blog/training-a-humanoid-robot-for-hard-work/' },
    atlasspec: { t: 'Boston Dynamics, спецификация Atlas, Rev 10/15/2026', d: '15.10.2026', u: 'https://bostondynamics.com/products/atlas/' },
    bdent: { t: 'Boston Dynamics, «Enterprise Robotics, Redefined»', d: '05.01.2026', u: 'https://bostondynamics.com/blog/enterprise-robotics-redefined/' },
    bdfaq: { t: 'Boston Dynamics, FAQ', d: 'обновлено 20.05.2026', u: 'https://bostondynamics.com/faq/' },
    unig1: { t: 'Unitree, страница G1', d: 'прочитано 27.10.2026', u: 'https://www.unitree.com/g1' },
    unirl: { t: 'Unitree, репозиторий unitree_rl_gym', d: 'прочитано 27.10.2026', u: 'https://github.com/unitreerobotics/unitree_rl_gym' },
    unitele: { t: 'Unitree, репозиторий xr_teleoperate и наборы данных на Hugging Face', d: 'прочитано 27.10.2026', u: 'https://github.com/unitreerobotics/xr_teleoperate' },
    unidata: { t: 'Unitree, раздел Data', d: 'прочитано 27.10.2026', u: 'https://www.unitree.com/data' },
    unidex: { t: 'Unitree, страница Dex3-1', d: 'прочитано 27.10.2026', u: 'https://www.unitree.com/Dex3-1' },
    unipro: { t: 'Unitree, проспект IPO (上会稿), с. 27, 96, 128, 201', d: '25.05.2026', u: 'http://dataclouds.cninfo.com.cn/sjother2/documents/2026/2026-05-25/3d7fc0538abe281340a95c9c77a90525.pdf' },
    uniabout: { t: 'Unitree, страница About', d: 'прочитано 27.10.2026', u: 'https://www.unitree.com/about' },
    agai: { t: 'Agility Robotics, «Agility and AI»', d: '16.03.2026', u: 'https://www.agilityrobotics.com/content/agility-and-ai' },
    agwbc: { t: 'Agility Robotics, «Training a Whole-Body Control Foundation Model»', d: '28.08.2025', u: 'https://www.agilityrobotics.com/content/training-a-whole-body-control-foundation-model' },
    agfaq: { t: 'Agility Robotics, FAQ', d: 'прочитано 27.10.2026', u: 'https://www.agilityrobotics.com/faq' },
    agd5: { t: 'Agility Robotics, «Agility Unveils Digit 5»', d: '15.09.2026', u: 'https://www.agilityrobotics.com/content/agility-unveils-digit-5-humanoid-robot-built-for-cooperatively-safe-work-at-scale' },
    aggxo: { t: 'Agility Robotics и GXO, «GXO and Agility Robotics Expand Partnership»', d: '26.10.2026', u: 'https://www.agilityrobotics.com/content/gxo-and-agility-robotics-expand-partnership-to-accelerate-deployment-of-humanoids-in-u-s-operations' },
    agsec: { t: 'Проспект 424B3 Churchill Capital Corp XI и Agility Robotics, SEC', d: '13.10.2026', u: 'https://www.sec.gov/Archives/edgar/data/2074973/000121390026109058/ea0297114-07.htm' },
    agbatt: { t: 'Agility Robotics, пресс-релиз о новых возможностях Digit', d: '31.03.2025', u: 'https://www.agilityrobotics.com/content/agility-robotics-announces-new-innovations-for-market-leading-humanoid-robot-digit' },
    gr2: { t: 'Google DeepMind, «Gemini Robotics 2 brings whole body intelligence to robots»', d: '30.07.2026', u: 'https://deepmind.google/blog/gemini-robotics-2-brings-whole-body-intelligence-to-robots/' },
    grod: { t: 'Google DeepMind, «Gemini Robotics On-Device» и статья Gemini Robotics', d: '24.06.2025 и 25.03.2025', u: 'https://deepmind.google/blog/gemini-robotics-on-device-brings-ai-to-local-robotic-devices/' },
    ap2: { t: 'Apptronik, страница Apollo 2', d: 'прочитано 27.10.2026', u: 'https://apptronik.com/apollo/apollo-2' },
    appark: { t: 'Apptronik, «Welcome to Robot Park»', d: '30.06.2026', u: 'https://apptronik.com/news-collection/welcome-to-robot-park-where-apptroniks-apollo-goes-to-work' },
    ap1: { t: 'Apptronik, «Apptronik Unveils Apollo» и пост о NVIDIA', d: '23.08.2023 и 18.03.2024', u: 'https://apptronik.com/news-collection/apptronik-unveils-apollo' },
    apmb: { t: 'Apptronik, «Apptronik and Mercedes-Benz Enter Commercial Agreement»', d: '15.03.2024', u: 'https://apptronik.com/news-collection/apptronik-and-mercedes-benz-enter-commercial-agreement' },
    agigo1: { t: 'AgiBot, блог GO-1', d: '10.03.2025', u: 'https://agibot-world.com/blog/go1' },
    agiloco: { t: 'AgiBot, анонс роботов 2024 года и AGILE 2.0', d: '18.08.2024 и 09.09.2026', u: 'https://www.agibot.com/article/231/detail/121.html' },
    agiworld: { t: 'AgiBot World, сайт и README', d: 'прочитано 27.10.2026', u: 'https://agibot-world.com/' },
    agige: { t: 'AgiBot, «GE-Act 2.0»', d: '10.09.2026', u: 'https://www.agibot.com/article/231/detail/120.html' },
    agia2: { t: 'AgiBot, страницы A2 Ultra и X2', d: 'прочитано 27.10.2026', u: 'https://www.agibot.com/products/A2_Ultra' },
    agiuse: { t: 'AgiBot, новости о Longcheer, магазинах ASD и выпуске', d: '14.04.2026–30.09.2026', u: 'https://www.agibot.com/article/231/detail/60.html' },
    agirent: { t: 'AgiBot, новость о выставке LEAP 2026', d: '02.09.2026', u: 'https://www.agibot.com/article/231/detail/93.html' },
    agiwaic: { t: 'AgiBot, новость о WAIC 2026', d: '18.07.2026', u: 'https://www.agibot.com/article/231/detail/85.html' },
    redwood: { t: '1X, «Redwood AI»', d: '10.06.2025', u: 'https://www.1x.tech/discover/redwood-ai' },
    xmob: { t: '1X, «Redwood AI: Mobility» и «Introducing NEO Gamma»', d: '11.06.2025 и 21.02.2025', u: 'https://www.1x.tech/discover/redwood-mobility' },
    xwm: { t: '1X, «1X World Model | From Video to Action»', d: '12.01.2026', u: 'https://www.1x.tech/discover/world-model-self-learning' },
    xneo: { t: '1X, страница NEO и FAQ', d: 'прочитано 27.10.2026', u: 'https://www.1x.tech/neo' },
    xorder: { t: '1X, «NEO Home Robot | Order Today»', d: '28.10.2025', u: 'https://www.1x.tech/discover/neo-home-robot' },
    xfactory: { t: '1X, «NEO Factory»', d: '30.04.2026', u: 'https://www.1x.tech/discover/neo-factory' },
    tslaiday: { t: 'Tesla, AI Day 2022 (запись трансляции)', d: '30.09.2022', u: 'https://www.youtube.com/watch?v=ODSJsviD_SU' },
    tsl2024: { t: 'Tesla Optimus и М. Ковач, посты о работе на заводе', d: '23.09.2023 и 05.05.2024', u: 'https://x.com/_milankovac_/status/1787028644399132777' },
    tslrl: { t: 'М. Ковач о танце, обученном в симуляции; AI Day 2022', d: '13.05.2025', u: 'https://x.com/_milankovac_/status/1922098244278161823' },
    tslvideo: { t: 'М. Ковач о переносе с видео людей', d: '21.05.2025', u: 'https://x.com/_milankovac_/status/1925047791954612605' },
    tslhand: { t: 'Tesla, AI Day 2022; М. Ковач о новой кисти', d: '30.09.2022 и 16.10.2024', u: 'https://x.com/_milankovac_/status/1846410551318257675' },
    tslq425: { t: 'Tesla, звонок для инвесторов за IV квартал 2025 года', d: '28.01.2026', u: 'https://www.youtube.com/watch?v=oK0UZEE9GPo' },
    tsl10k: { t: 'Tesla, годовой отчёт 10-K за 2025 год', d: '29.01.2026', u: 'https://www.sec.gov/Archives/edgar/data/1318605/000162828026003952/tsla-20251231.htm' },
    tslwr: { t: 'М. Ковач, вице-президент Tesla по Optimus, о показе We, Robot', d: '16.10.2024', u: 'https://x.com/_milankovac_/status/1846410551318257675' },
    l61: { t: 'урок 6.1', d: '', u: '' }, l63: { t: 'уроки 6.2–6.3', d: '', u: '' }, l64: { t: 'урок 6.4', d: '', u: '' }, l65: { t: 'урок 6.5', d: '', u: '' }, l44: { t: 'урок 4.4', d: '', u: '' }, l01: { t: 'урок 0.1', d: '', u: '' },
  };
  /* ---------- строки таблицы ---------- */
  const ROWS = [
    { id: 'figure', name: 'Figure 03', org: 'Figure · Helix 02', cells: {
      top: { t: 'Helix 02: S2 понимает сцену и язык, S1 выдаёт цели всех суставов 200 раз в секунду', m: 'nn', s: 'helix02' },
      low: { t: 'S0: сеть на 10 млн параметров, 1000 раз в секунду, обучена в симуляции', m: 'nn', s: 'helix02' },
      where: { t: 'на борту: Helix считается на роботе', m: 'yes', s: 'helixpage' },
      teleop: { t: 'около 500 ч для Helix, от 8 до 60 ч на сортировку посылок', m: 'yes', s: 'helixlog' },
      human: { t: 'Index: записи людей с носимой камерой, на них предобучена Helix 2.5', m: 'yes', s: 'index', task: true },
      sim: { t: 'S0 и ходьба по рельефу: обучение с подкреплением в симуляции', m: 'yes', s: 'ramp' },
      act: { t: 'собственные электрические, тип не назван', m: 'na', s: 'fig03' },
      hand: { t: 'камера в каждой ладони, датчики на пальцах чувствуют от 3 г', m: 'i', s: 'fig03' },
      batt: { t: '2,3 кВт·ч на 5 ч; сам встаёт на подставку и заряжается через стопы', m: 'yes', s: 'fig03' },
      site: { t: 'BMW: Figure 02 загружал листовые детали в сварочную оснастку, Figure 03 перешёл на комплектацию; склады Catalyst Brands', m: 'yes', s: 'figbmw' },
      price: { t: 'не объявлена', m: 'na', s: 'figsite' },
      show: { t: 'компания называет задачи на видео автономными: посудомойка — 4 мин без помощи', m: 'i', s: 'helix02' },
    } },
    { id: 'tesla', name: 'Optimus', org: 'Tesla', cells: {
      top: { t: 'одна нейросеть «video in, controls out» (2023); в 2024 году сеть вела верх тела', m: 'nn', s: 'tsl2024' },
      low: { t: 'в 2022 году — планировщик и оценка состояния; танец 2025 года обучен в симуляции, про ходьбу не сказано', m: 'na', s: 'tslrl' },
      where: { t: 'на борту: сеть работает на компьютере автопилота Tesla в корпусе', m: 'yes', s: 'tsl2024' },
      teleop: { t: 'операторы в VR-шлемах, записи разнесли по парку роботов (2024)', m: 'yes', s: 'tsl2024' },
      human: { t: 'видео людей от первого лица для новых задач (2025)', m: 'yes', s: 'tslvideo', task: true },
      sim: { t: 'танец обучен с подкреплением в симуляции; ходьбу в 2022 проверяли в симуляторе автопилота', m: 'yes', s: 'tslrl' },
      act: { t: '28 приводов шести типов: волновые редукторы и роликовые винты (2022)', m: 'i', s: 'tslaiday' },
      hand: { t: '11 степеней свободы на 6 приводах (2022), новая кисть — 22', m: 'i', s: 'tslhand' },
      batt: { t: '2,3 кВт·ч на 52 В (2022); в 2024 году сам встаёт на станцию, о зарядке не сказано', m: 'na', s: 'tslaiday' },
      site: { t: 'заводы самой Tesla; в январе 2026 года — «still in the R&D phase»', m: 'no', s: 'tslq425' },
      price: { t: 'официально не объявлена', m: 'na', s: 'tsl10k' },
      show: { t: 'We, Robot 2024: «human assisted to some extent», говорит вице-президент Tesla', m: 'i', s: 'tslwr' },
    } },
    { id: 'atlas', name: 'Atlas', org: 'Boston Dynamics', cells: {
      top: { t: 'LBM с TRI: 450 млн параметров, 30 раз в секунду (2025); с 2026 — исследования с Google DeepMind', m: 'nn', s: 'lbm' },
      low: { t: 'до 2025 — MPC; в 2026 контроллер всего тела обучен с подкреплением в симуляции', m: 'nn', s: 'bdhands' },
      where: { t: 'на борту: модели ИИ считает Jetson Thor', m: 'yes', s: 'bdthor' },
      teleop: { t: 'VR-телеоперация поверх MPC, по её записям учили LBM', m: 'yes', s: 'lbm' },
      human: { t: 'motion capture и видео людей учат движениям нижнего уровня, задачи — по телеоперации', m: 'no', s: 'zest' },
      sim: { t: 'обучение с подкреплением: год проб и ошибок за сутки симуляции', m: 'yes', s: 'bdfootball' },
      act: { t: 'два типа вращательных приводов, суставы полного оборота, 56 степеней свободы', m: 'i', s: 'bdwork' },
      hand: { t: 'четыре пальца, 13 степеней свободы, датчики давления на пальцах и ладони', m: 'i', s: 'bdhands' },
      batt: { t: '4 ч, с тяжёлым грузом 2 ч; сам меняет батарею за 3 мин', m: 'yes', s: 'atlasspec' },
      site: { t: 'Hyundai: завод в Джорджии и центр сбора данных RMAC; серийно — с 2028 года (план)', m: 'yes', s: 'bdent' },
      price: { t: 'не объявлена', m: 'na', s: 'bdfaq' },
      show: { t: 'паркур и танцы до 2024 года — движения, рассчитанные заранее', m: 'i', s: 'zest' },
    } },
    { id: 'unitree', name: 'Unitree G1', org: 'Unitree · G1, H1, H2, R1', cells: {
      top: { t: 'в базовой версии своей модели задач нет; на версию для разработчиков ставят UnifoLM, GR00T и другие', m: 'no', s: 'unipro' },
      low: { t: 'обученная политика: «imitation & reinforcement learning driven»', m: 'nn', s: 'unig1' },
      where: { t: 'зависит от того, что поставит покупатель: Orin в версии для разработчиков, Thor в H2 Plus', m: 'no', s: 'unig1' },
      teleop: { t: 'xr_teleoperate: Vision Pro, PICO, Quest; 191 открытый набор записей G1', m: 'yes', s: 'unitele' },
      human: { t: 'наборы движений людей и видео от первого лица выложены, для чего их учат — не сказано', m: 'na', s: 'unidata' },
      sim: { t: 'unitree_rl_gym, rl_lab, rl_mjlab: обучение с подкреплением в Isaac и MuJoCo', m: 'yes', s: 'unirl' },
      act: { t: 'квазипрямые с малой инерцией и двумя энкодерами; колено 90–120 Н·м', m: 'i', s: 'unig1' },
      hand: { t: 'Dex3-1: три пальца, 7 степеней свободы, 33 датчика касания', m: 'i', s: 'unidex' },
      batt: { t: '9000 мА·ч, около 2 ч; батарею меняет человек', m: 'no', s: 'unig1' },
      site: { t: 'покупают вузы, институты и компании для исследований: 5215 гуманоидов в 2025 году', m: 'no', s: 'unipro' },
      price: { t: 'G1 — от $13 500, H2 — $29 900, R1 — от $4 900', m: 'i', s: 'unig1' },
      show: { t: 'номер на новогоднем гала-концерте 2026 года Unitree называет полностью автономным', m: 'i', s: 'uniabout' },
    } },
    { id: 'digit', name: 'Digit', org: 'Agility Robotics', cells: {
      top: { t: 'слой «познания» с LLM и VLA над навыками, выученными по демонстрациям', m: 'nn', s: 'agai' },
      low: { t: '«моторная кора»: LSTM меньше 1 млн параметров, обучена в Isaac Sim', m: 'nn', s: 'agwbc' },
      where: { t: 'на борту: обученные контроллеры и модели рассуждения на NVIDIA Jetson', m: 'yes', s: 'agai' },
      teleop: { t: 'VR-телеоперация на своей площадке; у заказчика — только при настройке', m: 'yes', s: 'agfaq' },
      human: { t: 'motion capture упомянут в обучении по демонстрациям, видео людей — нет', m: 'na', s: 'agsec' },
      sim: { t: 'Isaac Sim и MuJoCo; моторная кора обучена только в симуляции', m: 'yes', s: 'agwbc' },
      act: { t: 'Digit 5: собственные циклоидальные приводы в ногах', m: 'i', s: 'agd5' },
      hand: { t: 'захваты вместо кистей; у Digit 5 они сменные', m: 'i', s: 'agd5' },
      batt: { t: 'Digit 4: 4 ч и сам встаёт на зарядную станцию', m: 'yes', s: 'agbatt' },
      site: { t: 'GXO с 2024 года: больше 100 000 ящиков; Toyota, Schaeffler, Mercado Libre', m: 'yes', s: 'aggxo' },
      price: { t: 'аренда (RaaS) или покупка; Amazon договорилась купить пять Digit за $1,05\u00A0млн и внесла задаток $367\u00A0500', m: 'i', s: 'agsec' },
      show: { t: 'Digit 4 работает только за ограждением, отдельно от людей', m: 'i', s: 'agfaq' },
    } },
    { id: 'apollo', name: 'Apollo', org: 'Apptronik', cells: {
      top: { t: 'Gemini Robotics; с 2026 года — всё тело «от стоп до кончиков пальцев»', m: 'nn', s: 'gr2' },
      low: { t: 'система Artemis Apptronik, алгоритм не опубликован', m: 'na', s: 'ap2' },
      where: { t: 'в 2025 основа модели в облаке, есть версия для борта; для Gemini Robotics 2 не сказано', m: 'na', s: 'grod' },
      teleop: { t: 'телеоперация в Robot Park; у Mercedes-Benz — телеоперация и дополненная реальность', m: 'yes', s: 'appark' },
      human: { t: 'не опубликовано', m: 'na', s: 'appark' },
      sim: { t: '«high-fidelity physics simulations» для сбора данных', m: 'yes', s: 'appark' },
      act: { t: 'Apollo 1 — линейные приводы; у Apollo 2 тип не назван', m: 'i', s: 'ap1' },
      hand: { t: 'Apollo 2: кисть Sharpa Wave, 22 степени свободы', m: 'i', s: 'gr2' },
      batt: { t: 'сменные батареи по 4 ч у Apollo 1; кто их меняет, не сказано', m: 'na', s: 'ap1' },
      site: { t: 'Mercedes-Benz: испытания на производстве, внутренняя логистика; GXO — испытания в лаборатории', m: 'yes', s: 'apmb' },
      price: { t: 'не объявлена', m: 'na', s: 'ap2' },
      show: { t: 'DeepMind пишет, что роботу ещё нужно прибавить в скорости движений', m: 'i', s: 'gr2' },
    } },
    { id: 'agibot', name: 'AgiBot', org: 'AgiBot · A2, X2, G2', cells: {
      top: { t: 'GO-1: модель зрения и языка, латентные действия и диффузионный эксперт действий', m: 'nn', s: 'agigo1' },
      low: { t: 'алгоритмы на модели и обучаемые (2024); AGILE 2.0 со зрением в контуре ходьбы (2026)', m: 'mix', s: 'agiloco' },
      where: { t: 'для GO-1 есть сервер политики вне робота; G2 переходит на Thor', m: 'mix', s: 'agiworld' },
      teleop: { t: 'фабрика данных: больше 100 роботов, VR и motion capture (урок 4.3)', m: 'yes', s: 'agiworld' },
      human: { t: 'видео людей: GO-1, 3000 ч в наборе GE-Act 2.0', m: 'yes', s: 'agige', task: true },
      sim: { t: 'Genie Sim: 10 000 ч данных из симуляции', m: 'yes', s: 'agiworld' },
      act: { t: 'A2: колено 270 Н·м, тип приводов не назван', m: 'i', s: 'agia2' },
      hand: { t: 'кисть с 6 степенями свободы, у новой OmniHand — 22 на тросах', m: 'i', s: 'agia2' },
      batt: { t: 'A2: батарею меняют без выключения, сам ли робот — не сказано', m: 'na', s: 'agia2' },
      site: { t: 'завод Longcheer, 100 магазинов, выставки; выпущено 20 000 роботов', m: 'yes', s: 'agiuse' },
      price: { t: 'аренда от 2000 риалов в день, цены покупки на сайте нет', m: 'i', s: 'agirent' },
      show: { t: 'показ бокса на WAIC 2026 вела телеоперация', m: 'i', s: 'agiwaic' },
    } },
    { id: 'neo', name: 'NEO', org: '1X', cells: {
      top: { t: 'Redwood: 160 млн параметров, 5 раз в секунду; руки, ходьба и поза таза', m: 'nn', s: 'redwood' },
      low: { t: 'контроллер, обученный с подкреплением в симуляции; у NEO Gamma — 100 раз в секунду', m: 'nn', s: 'xmob' },
      where: { t: 'на борту: Redwood на GPU в голове, Jetson Thor; модель мира — на сервере', m: 'yes', s: 'redwood' },
      teleop: { t: 'телеоперация и автономные попытки в офисах и домах сотрудников', m: 'yes', s: 'redwood' },
      human: { t: 'модель мира 1X: 900 ч видео людей от первого лица', m: 'yes', s: 'xwm', task: true },
      sim: { t: 'обучение с подкреплением в Isaac Lab со случайной физикой', m: 'yes', s: 'xmob' },
      act: { t: 'тросовые приводы с малой инерцией, обратимость 95 %', m: 'i', s: 'xneo' },
      hand: { t: '22 степени свободы, кисти водонепроницаемые', m: 'i', s: 'xneo' },
      batt: { t: '4 ч работы, быстрая зарядка; сам ли встаёт на зарядку — не сказано', m: 'na', s: 'xneo' },
      site: { t: 'дом: предзаказ; в апреле 2026 первые NEO шли своей команде', m: 'no', s: 'xfactory' },
      price: { t: '$20 000 или $499 в месяц', m: 'i', s: 'xorder' },
      show: { t: 'режим Expert: незнакомую работу по расписанию ведёт оператор 1X', m: 'i', s: 'xneo' },
    } },
    { id: 'ada', name: 'Ада', org: 'уроки 6.1–6.5', ada: true, cells: {
      top: { t: 'модель зрения, языка и действий над контроллером тела', m: 'nn', s: 'l64' },
      low: { t: 'политика ходьбы и трекер всего тела, обученные в симуляции', m: 'nn', s: 'l63' },
      where: { t: 'на борту: Thor из лаборатории урока 6.5', m: 'yes', s: 'l65' },
      teleop: { t: 'записи оператора для политики по командам', m: 'yes', s: 'l64' },
      human: { t: 'записи движений людей для трекера; видео людей для задач у стола', m: 'yes', s: 'l44', task: true },
      sim: { t: 'ходьба и трекер обучены с подкреплением в симуляции', m: 'yes', s: 'l61' },
      act: { t: 'квазипрямые, как у Berkeley Humanoid', m: 'i', s: 'l65' },
      hand: { t: 'Inspire: 6 приводов на 12 суставов', m: 'i', s: 'l65' },
      batt: { t: '0,86 кВт·ч на 3,2 ч; батарею меняет человек', m: 'no', s: 'l65' },
      site: { t: 'дом курса из урока 0.1', m: 'no', s: 'l01' },
      price: { t: 'персонаж курса', m: 'i', s: 'l01' },
      show: { t: 'все опыты с ней считаются в браузере', m: 'i', s: 'l01' },
    } },
  ];

  /* ---------- вопросы миссий ---------- */
  const Q = {
    push: { col: 'low', rule: (r) => r.cells.low.m === 'nn', answer: ['figure', 'atlas', 'unitree', 'digit', 'neo', 'ada'],
      why: { nn: 'Нижний уровень обучен, толчок ловит нейросеть.', cl: 'Нижний уровень написан людьми.', mix: 'Опубликованы и алгоритмы на модели, и обучаемые, и какой из них ловит толчок в работе, не сказано.', na: 'Как устроен нижний уровень сейчас, не опубликовано, поэтому отмечать нельзя.' },
      rest: 'У AgiBot опубликованы и алгоритмы на модели, и обучаемые, у Apollo не раскрыт алгоритм системы Artemis, а Tesla обученным в симуляции назвала танец, а не ходьбу. По таблице эти платформы отметить нельзя.' },
    offline: { col: 'where', rule: (r) => r.cells.where.m === 'yes', answer: ['figure', 'tesla', 'atlas', 'digit', 'neo', 'ada'],
      why: { yes: 'Модель верхнего уровня считается на роботе.', no: 'Своей модели задач на роботе нет, её ставит покупатель.', mix: 'Модель запускают и на роботе, и на сервере вне его.', na: 'Где считается модель верхнего уровня, не опубликовано.' },
      rest: 'У Apollo в 2025 году основа Gemini Robotics работала в облаке, а для Gemini Robotics 2 место не названо. У AgiBot для GO-1 есть сервер вне робота, а G2 переходит на Thor. У Unitree модель задач ставит сам покупатель.' },
    human: { col: 'human', rule: (r) => r.cells.human.m === 'yes' && r.cells.human.task === true, answer: ['figure', 'tesla', 'agibot', 'neo', 'ada'],
      why: { yes: 'Видео и записи людей учат модель задачам.', no: 'Записи людей учат движениям нижнего уровня, а задачам учат по телеоперации.', na: 'Чему учат по записям людей, не опубликовано.' },
      rest: 'Atlas по motion capture и видео учит трюки нижнего уровня, как трекеры урока 6.3, поэтому в ответ не попадает. Unitree выложила записи людей, но не пишет, чему по ним учит; у Digit и Apollo это тоже не сказано.' },
    shift: { col: 'batt', rule: (r) => r.cells.batt.m === 'yes', answer: ['figure', 'atlas', 'digit'],
      why: { yes: 'Робот сам меняет батарею или сам встаёт на зарядку.', no: 'Батарею меняет человек.', na: 'Сам ли робот меняет батарею или заряжается, не сказано.' },
      rest: 'Батареи Apollo и AgiBot A2 сменные, но кто их меняет, не сказано. Optimus в ролике 2024 года сам встаёт на станцию, но о зарядке там ни слова. Про NEO не сказано, встаёт ли он на зарядку сам, а у G1 и Ады батарею меняет человек.' },
    customer: { col: 'site', rule: (r) => r.cells.site.m === 'yes', answer: ['figure', 'atlas', 'digit', 'apollo', 'agibot'],
      why: { yes: 'Робот работает на задаче заказчика.', no: 'Пока только у себя, на испытаниях или в исследованиях.', na: 'Не опубликовано.' },
      rest: 'Optimus работает на заводах самой Tesla, и в январе 2026 года компания называла его этапом исследований. Первые серийные NEO в апреле 2026 года шли команде 1X, а поставки в дома на сайте компании пока не подтверждены. Unitree покупают для исследований и учёбы.' },
  };

  const rowById = (id) => ROWS.find((r) => r.id === id);
  const cell = (rowId, col) => rowById(rowId).cells[col];
  /** Ответ на вопрос по правилу: строки, для которых правило верно. */
  const ruleAnswer = (qid) => ROWS.filter((r) => Q[qid].rule(r)).map((r) => r.id);
  /** Проверка отметок: какие отмечены верно, какие пропущены, какие лишние. */
  function check(qid, sel) {
    const want = new Set(Q[qid].answer), got = new Set(sel || []);
    const hit = ROWS.filter((r) => want.has(r.id) && got.has(r.id)).map((r) => r.id);
    const miss = ROWS.filter((r) => want.has(r.id) && !got.has(r.id)).map((r) => r.id);
    const extra = ROWS.filter((r) => !want.has(r.id) && got.has(r.id)).map((r) => r.id);
    return { qid, sel: ROWS.filter((r) => got.has(r.id)).map((r) => r.id), answer: Q[qid].answer.slice(), hit, miss, extra, ok: !miss.length && !extra.length, n: got.size };
  }
  /** Две строки рядом: все колонки по осям, где тексты или метки расходятся. */
  function compare(a, b) {
    const ra = rowById(a), rb = rowById(b), rows = [];
    for (const ax of AXES) for (const c of ax.cols) {
      const x = ra.cells[c], y = rb.cells[c];
      rows.push({ axis: ax.id, col: c, a: x, b: y, diff: x.m !== y.m });
    }
    return { a, b, rows, ndiff: rows.filter((r) => r.diff).length };
  }
  /** Число строк с меткой m в колонке col. */
  const count = (col, m) => ROWS.filter((r) => r.cells[col].m === m).length;

  const API = { AXES, COLS, MARK, AXIS_OF, SRC, ROWS, Q, rowById, cell, ruleAnswer, check, compare, count };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.L66 = API;
})(typeof window !== 'undefined' ? window : this);
