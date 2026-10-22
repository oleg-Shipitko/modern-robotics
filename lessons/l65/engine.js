/* =====================================================================
   l65/engine.js — движок урока 6.5 «Аппаратная часть гуманоида». Без DOM:
   в браузере — window.L65, в Node — require. Только арифметика и Math.round,
   без случайности: Node, Chrome и Safari дают одни числа.

   Лаборатория «Бюджет массы, мощности и вычислений»: читатель собирает Аду
   из приводов, кистей, вычислителя и батареи под задачу «нести коробку 5 кг
   по квартире два часа» и видит, во что упирается конфигурация.

   Что из чего взято (досье sources/dossier/6.5-apparatnaya-chast.md):
   - приводы — таблица 2 статьи Berkeley Humanoid (2407.21781): масса, пиковый
     и длительный момент, наибольшая мощность, инерция ротора; все 9 : 1;
   - кисти — страницы Inspire, Wonik (Allegro), Sharpa, Shadow Robot и статья
     LEAP Hand: масса, степени свободы, суставы; ток покоя Inspire и Sharpa —
     со страниц, у остальных мощность покоя — допущение модели;
   - вычислители — страницы NVIDIA Jetson Orin и Thor: верх диапазона мощности
     выбранного режима; задержка верхнего уровня — якоря из уроков 3.7 и 6.4;
   - батареи — документация Unitree G1 (9000 мА·ч × 13 элементов → ≈ 0,43 кВт·ч
     при 3,7 В на элемент, расчёт), Unitree H1 (0,864 кВт·ч), Figure 03 (2,3 кВт·ч);
     масса — 130 Вт·ч на кг (модель; ToddlerBot ≈ 138, Mobile ALOHA ≈ 90);
   - ходьба — P = CoT · m · g · v, CoT = 0,7 как у Cassie (Kashiri и соавторы,
     2018: 200 Вт при 1 м/с у робота 30 кг), v = 0,5 м/с, 60 % времени;
   - Ада 28 кг как в 6.1 (ноги по 5 кг, корпус с головой и руками 18 кг);
     разложение корпуса на раму, батарею, руки и кисти — наше.
   ===================================================================== */
'use strict';
(function (root) {
  const G = 9.81;
  /** Приводы (Berkeley Humanoid, табл. 2): масса кг, пиковый и длительный момент Н·м, наибольшая мощность Вт, инерция ротора кг·м². */
  const ACT = {
    '5013': { id: '5013', m: 0.251, peak: 9.7, sust: 4.59, pmax: 220, J: 6.1e-6 },
    '8513': { id: '8513', m: 0.756, peak: 45.3, sust: 18.9, pmax: 570, J: 6.9e-5 },
    '8518': { id: '8518', m: 0.856, peak: 62.6, sust: 26.1, pmax: 730, J: 9.4e-5 },
    '10413': { id: '10413', m: 1.011, peak: 81.1, sust: 34.2, pmax: 890, J: 1.5e-4 },
  };
  const ACT_ORDER = ['5013', '8513', '8518', '10413'];
  /** Кисти: масса кг, активные степени свободы, суставы, мощность покоя Вт (src: 'page' — со страницы производителя, 'model' — допущение). */
  const HAND = {
    inspire: { id: 'inspire', name: 'Inspire RH56DFX', m: 0.54, dof: 6, joints: 12, idle: 2.16, idleSrc: 'page', drive: 'тяги от шести приводов в ладони' },
    leap: { id: 'leap', name: 'LEAP Hand', m: 0.595, dof: 16, joints: 16, idle: 10, idleSrc: 'model', drive: 'моторы в суставах пальцев' },
    allegro: { id: 'allegro', name: 'Allegro Hand', m: 1.08, dof: 16, joints: 16, idle: 10, idleSrc: 'model', drive: 'моторы в суставах пальцев' },
    sharpa: { id: 'sharpa', name: 'Sharpa Wave', m: 1.3, dof: 22, joints: 22, idle: 15, idleSrc: 'page', drive: '22 приводных модуля' },
    shadow: { id: 'shadow', name: 'Shadow Hand', m: 4.3, dof: 20, joints: 24, idle: 15, idleSrc: 'model', drive: '40 тросов от 20 моторов в основании' },
  };
  const HAND_ORDER = ['inspire', 'leap', 'allegro', 'sharpa', 'shadow'];
  /** Вычислитель и место модели верхнего уровня: мощность Вт (верх режима по страницам NVIDIA), задержка верхнего уровня мс (якоря уроков 3.7 и 6.4). */
  const COMP = {
    nx: { id: 'nx', name: 'Orin NX, малая политика на борту', w: 25, lat: 40, latSrc: 'как HIT в HumanPlus: 25 раз в секунду на борту' },
    cloud: { id: 'cloud', name: 'Orin NX на борту, VLA в облаке', w: 25, lat: 250, latSrc: 'как у Gemini Robotics в уроке 3.7' },
    thor: { id: 'thor', name: 'Thor, VLA на борту', w: 130, lat: 73, latSrc: 'как у π0 на борту в уроке 3.7' },
  };
  const COMP_ORDER = ['nx', 'cloud', 'thor'];
  /** Батареи: энергия Вт·ч. */
  const BATT = {
    g1: { id: 'g1', name: 'как у Unitree G1', wh: 433, src: '9000 мА·ч × 13 элементов × 3,7 В (расчёт)' },
    h1: { id: 'h1', name: 'как у Unitree H1', wh: 864, src: '15 А·ч, 0,864 кВт·ч (документация)' },
    f3: { id: 'f3', name: 'как у Figure 03', wh: 2300, src: '2,3 кВт·ч (Figure, 17.07.2025)' },
  };
  const BATT_ORDER = ['g1', 'h1', 'f3'];
  /** Постоянные модели. */
  const CFG = {
    FRAME: 10.3,      // рама: корпус с головой, камеры и лидар, IMU, проводка и электроника, кг
    ARM_LINKS: 0.6,   // звенья одной руки, кг; центр масс на ARM_CM от плеча
    ARM_CM: 0.18,
    ARM_N: 4,         // приводов в руке
    LEG_LINKS: 0.5,   // звенья и стопа одной ноги, кг
    LEG_N: 6,         // приводов в ноге
    SHANK: 2.4,       // голень со стопой опорной ноги, не нагружают колено, кг (как в 6.1: 1,8 + 0,6)
    WH_PER_KG: 130,   // плотность энергии батареи, Вт·ч/кг
    LOAD: 5,          // груз, кг, в двух руках
    L_ARM: 0.37,      // вытянутая рука: плечо 0,20 + предплечье 0,17 (как в 6.4)
    L_CARRY: 0.30,    // коробка перед собой на согнутых руках
    KNEE_STEP: 0.16,  // плечо силы тяжести относительно колена на подъёме на ступеньку, м
    KNEE_WALK: 0.06,  // то же в среднем при ходьбе, м
    OMEGA: 2.0,       // скорость колена и бедра на подъёме, рад/с
    COT: 0.7,         // стоимость транспорта, как у Cassie
    V: 0.5,           // скорость ходьбы, м/с
    DUTY: 0.6,        // доля времени в движении
    SENSORS: 10,      // камеры, лидар, связь, Вт
    DRIVER: 2,        // электроника и удержание позы, Вт на привод
    VBUS: 48,         // напряжение шины для пересчёта мощности в ток, В
    HOURS: 2,         // задача: два часа
  };
  const DEFAULT = { legs: '8513', arms: '5013', hands: 'inspire', comp: 'nx', batt: 'g1' };
  const r1 = (x) => Math.round(x * 10) / 10, r2 = (x) => Math.round(x * 100) / 100;

  /** Бюджет конфигурации: массы, моменты, мощности, время работы, задержка, проверки. */
  function compute(cfg) {
    cfg = Object.assign({}, DEFAULT, cfg || {});
    const A = ACT[cfg.arms], Lg = ACT[cfg.legs], H = HAND[cfg.hands], C = COMP[cfg.comp], Bt = BATT[cfg.batt];
    const mBatt = Bt.wh / CFG.WH_PER_KG, mHands = 2 * H.m, mArms = 2 * (CFG.ARM_LINKS + CFG.ARM_N * A.m), mLegs = 2 * (CFG.LEG_LINKS + CFG.LEG_N * Lg.m);
    const mass = CFG.FRAME + mBatt + mHands + mArms + mLegs, total = mass + CFG.LOAD;
    // плечо: взять коробку вытянутыми руками (пик) и нести перед собой (длительно); груз делится на две руки
    const half = H.m + CFG.LOAD / 2;
    const armPeakNeed = G * (CFG.ARM_LINKS * CFG.ARM_CM + half * CFG.L_ARM), armSustNeed = G * (CFG.ARM_LINKS * CFG.ARM_CM + half * CFG.L_CARRY);
    // колено: подъём на ступеньку с коробкой (пик) и ходьба (длительно)
    const kneePeakNeed = (total - CFG.SHANK) * G * CFG.KNEE_STEP, kneeSustNeed = total * G * CFG.KNEE_WALK;
    // мощность
    const pWalk = CFG.COT * total * G * CFG.V, nDrivers = 2 * (CFG.ARM_N + CFG.LEG_N);
    const pHands = 2 * H.idle, pDrivers = nDrivers * CFG.DRIVER, pIdle = C.w + CFG.SENSORS + pHands + pDrivers;
    const pAvg = pWalk * CFG.DUTY + pIdle, pPeak = 2 * kneePeakNeed * CFG.OMEGA + pIdle;
    const hours = Bt.wh / pAvg;
    const checks = {
      armPeak: armPeakNeed <= A.peak, armSust: armSustNeed <= A.sust,
      kneePeak: kneePeakNeed <= Lg.peak, kneeSust: kneeSustNeed <= Lg.sust,
      time: hours >= CFG.HOURS,
    };
    checks.arms = checks.armPeak && checks.armSust; checks.legs = checks.kneePeak && checks.kneeSust; checks.all = checks.arms && checks.legs && checks.time;
    // что упирается первым: руки → ноги → время (порядок задачи: сначала взять коробку, потом идти, потом два часа)
    const binding = !checks.arms ? 'arms' : !checks.legs ? 'legs' : !checks.time ? 'time' : null;
    return {
      cfg, parts: { A, L: Lg, H, C, B: Bt },
      mass: { frame: CFG.FRAME, batt: mBatt, hands: mHands, arms: mArms, legs: mLegs, total: mass, withLoad: total },
      arm: { peakNeed: armPeakNeed, sustNeed: armSustNeed, peak: A.peak, sust: A.sust },
      knee: { peakNeed: kneePeakNeed, sustNeed: kneeSustNeed, peak: Lg.peak, sust: Lg.sust },
      power: { walk: pWalk, walkAvg: pWalk * CFG.DUTY, comp: C.w, sensors: CFG.SENSORS, hands: pHands, drivers: pDrivers, idle: pIdle, avg: pAvg, peak: pPeak, peakAmps: pPeak / CFG.VBUS },
      hours, lat: C.lat, latCm: C.lat / 1000 * CFG.V * 100, checks, binding,
    };
  }
  /** Самый лёгкий привод из списка, который держит нужный момент и пиком, и длительно; null, если такого нет. */
  function minAct(peakNeed, sustNeed) { for (const id of ACT_ORDER) { const a = ACT[id]; if (peakNeed <= a.peak && sustNeed <= a.sust) return id; } return null; }
  /** Все конфигурации (540 штук) — для проверок утверждений урока в Node. */
  function allConfigs() {
    const out = [];
    for (const legs of ACT_ORDER) for (const arms of ACT_ORDER) for (const hands of HAND_ORDER) for (const comp of COMP_ORDER) for (const batt of BATT_ORDER) out.push({ legs, arms, hands, comp, batt });
    return out;
  }
  const API = { G, ACT, ACT_ORDER, HAND, HAND_ORDER, COMP, COMP_ORDER, BATT, BATT_ORDER, CFG, DEFAULT, compute, minAct, allConfigs, r1, r2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.L65 = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
