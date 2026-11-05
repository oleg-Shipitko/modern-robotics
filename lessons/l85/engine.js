/* Урок 8.5: карта бенчмарков и три прозрачные синтетические модели. Без DOM. */
'use strict';
(function (root) {
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  function mix32(x) { x = Math.imul(x ^ (x >>> 16), 0x7feb352d) >>> 0; x = Math.imul(x ^ (x >>> 15), 0x846ca68b) >>> 0; return (x ^ (x >>> 16)) >>> 0; }
  function U(seed, a, b, c) { let h = mix32(seed ^ Math.imul(a + 1, 0x9e3779b9)); h = mix32(h ^ Math.imul(b + 3, 0x85ebca6b)); return mix32(h ^ Math.imul(c + 7, 0xc2b2ae35)) / 4294967296; }

  /* Карта — не рейтинг: дискретные категории нужны для навигации. */
  const BENCHMARKS = [
    { id:'rlbench', name:'RLBench', year:2020, world:'sim', horizon:'skill', body:'single', focus:'Каталог навыков', scale:'100 задач', note:'Однорукая манипуляция, визуальные наблюдения и демонстрации планировщика.', url:'https://arxiv.org/abs/1909.12271' },
    { id:'libero', name:'LIBERO', year:2023, world:'sim', horizon:'skill', body:'single', focus:'Перенос знаний', scale:'130 задач', note:'Разделяет перенос по объектам, целям, пространству и длинным задачам.', url:'https://libero-project.github.io/main.html' },
    { id:'calvin', name:'CALVIN', year:2022, world:'sim', horizon:'chain', body:'single', focus:'Длинная цепочка', scale:'34 навыка', note:'Пять языковых инструкций подряд и перенос в невиданную среду D.', url:'https://arxiv.org/abs/2112.03227' },
    { id:'robocasa', name:'RoboCasa365', year:2026, world:'sim', horizon:'chain', body:'mobile', focus:'Составные кухни', scale:'365 задач', note:'Атомарные и составные задачи в более чем 2500 кухнях, три разбиения.', url:'https://robocasa.ai/' },
    { id:'behavior', name:'BEHAVIOR-1K', year:2025, world:'sim', horizon:'household', body:'mobile', focus:'Полные бытовые задачи', scale:'1000 активностей', note:'Длинные мобильные манипуляции в 50 интерактивных сценах.', url:'https://behavior.stanford.edu/' },
    { id:'humanoid', name:'HumanoidBench', year:2024, world:'sim', horizon:'whole', body:'humanoid', focus:'Всё тело', scale:'27 задач', note:'Локомоция, манипуляция и координация тела H1 с двумя кистями.', url:'https://humanoid-bench.github.io/' },
    { id:'liberoplus', name:'LIBERO-Plus', year:2026, world:'sim', horizon:'stress', body:'single', focus:'Устойчивость VLA', scale:'10 030 вариантов', note:'Семь осей изменений: от положения камеры до языка и шума сенсоров.', url:'https://openaccess.thecvf.com/content/CVPR2026/html/Fei_LIBERO-Plus_A_Progressive_Robustness_Benchmark_for_Visual-Language-Action_Models_CVPR_2026_paper.html' },
    { id:'robotwin', name:'RoboTwin 2.0', year:2026, world:'sim', horizon:'stress', body:'dual', focus:'Две руки и sim-to-real', scale:'50 задач · 5 тел', note:'Двуручные задачи и сильная рандомизация сцены, света, языка и высоты стола.', url:'https://robotwin-platform.github.io/' },
    { id:'vlabench', name:'VLABench', year:2025, world:'sim', horizon:'chain', body:'single', focus:'Знания и рассуждение', scale:'100 категорий', note:'Неявные намерения, знания о мире и длинные языковые задачи.', url:'https://arxiv.org/abs/2412.18194' },
    { id:'simpler', name:'SIMPLER', year:2024, world:'bridge', horizon:'skill', body:'single', focus:'Связь sim ↔ real', scale:'парная сверка', note:'Проверяет, сохраняет ли симуляция порядок реальных политик и сдвигов.', url:'https://arxiv.org/abs/2405.05941' },
    { id:'robotarenainf', name:'RobotArena∞', year:2026, world:'bridge', horizon:'stress', body:'single', focus:'Реальные записи → sim', scale:'живой набор', note:'Реконструированные сцены, управляемые изменения и человеческие предпочтения.', url:'https://arxiv.org/abs/2510.23571' },
    { id:'roboarena', name:'RoboArena', year:2025, world:'real', horizon:'household', body:'single', focus:'Распределённая реальность', scale:'сеть площадок', note:'Двойные слепые A/B-пары на DROID в задачах, выбранных площадками.', url:'https://robo-arena.github.io/' },
  ];

  /* Лаборатория 1. Один синтетический кандидат проходит три экзамена. */
  const SUITES = {
    libero: { id:'libero', name:'Короткий знакомый навык', benchmark:'LIBERO', stages:['увидеть чашку','подвести захват','взять','поставить в цель'], need:['vision','reach','grasp','place'], scene:'table' },
    calvin: { id:'calvin', name:'Цепочка из пяти инструкций', benchmark:'CALVIN', stages:['открыть ящик','взять кубик','закрыть ящик','нажать кнопку','поставить кубик'], need:['reach','grasp','memory','memory','place'], scene:'chain' },
    liberoplus: { id:'liberoplus', name:'Камера и цель сдвинуты', benchmark:'LIBERO-Plus', stages:['найти цель','пересчитать координаты','взять предмет','поставить в новую цель'], need:['vision','robust','grasp','robust'], scene:'shift' },
  };
  const CANDIDATE = { name:'Кандидат P', ability:{ vision:true, reach:true, grasp:true, place:true, memory:false, robust:false } };
  function runSuite(id) {
    const suite = SUITES[id] || SUITES.libero; let alive = true;
    const stages = suite.stages.map((name, i) => { const need=suite.need[i], before=alive, pass=before && !!CANDIDATE.ability[need]; if(!pass) alive=false; return { name, need, pass, skipped:!before }; });
    const passed=stages.filter(x=>x.pass).length; return { suite, stages, passed, total:stages.length, complete:passed===stages.length, score:passed/stages.length };
  }

  /* Лаборатория 2. Запомненные координаты против относительной геометрии. */
  function shortcutEval(target, camera) {
    target=clamp(+target,.16,.84); camera=clamp(+camera,-.28,.28);
    const memorized=clamp(.5+camera,.08,.92), relational=target;
    const tol=.085, mErr=Math.abs(memorized-target), rErr=Math.abs(relational-target);
    return { target, camera, memorized, relational, mErr, rErr, memPass:mErr<=tol, relPass:rErr<=tol, tol };
  }

  /* Лаборатория 3. Синтетическая A/B-арена: одинаковая задача внутри пары. */
  const ARENA_POLICIES = [
    { id:'atlas', name:'Atlas', color:'classic', skill:{ kitchen:.91, clutter:.56, long:.48 } },
    { id:'beacon', name:'Beacon', color:'e2e', skill:{ kitchen:.74, clutter:.82, long:.66 } },
    { id:'coral', name:'Coral', color:'hybrid', skill:{ kitchen:.61, clutter:.70, long:.90 } },
  ];
  const SITES = {
    kitchen:{ id:'kitchen', name:'Кухня', kind:'kitchen', mix:{kitchen:1,clutter:0,long:0}, task:'поставить чашку в лоток' },
    workshop:{ id:'workshop', name:'Мастерская', kind:'clutter', mix:{kitchen:.1,clutter:.8,long:.1}, task:'взять деталь между препятствиями' },
    home:{ id:'home', name:'Дом', kind:'long', mix:{kitchen:.1,clutter:.2,long:.7}, task:'открыть шкаф, взять кружку и убрать её' },
  };
  function ability(p,site){return Object.keys(site.mix).reduce((s,k)=>s+p.skill[k]*site.mix[k],0)}
  function duel(leftId,rightId,siteId,seed){const left=ARENA_POLICIES.find(x=>x.id===leftId)||ARENA_POLICIES[0],right=ARENA_POLICIES.find(x=>x.id===rightId)||ARENA_POLICIES[1],site=SITES[siteId]||SITES.kitchen;seed=seed||1;const la=ability(left,site),ra=ability(right,site);const shared=.18*(U(8591,seed,0,0)-.5);const ln=.10*(U(8591,seed,1,0)-.5),rn=.10*(U(8591,seed,2,0)-.5);const lp=clamp(la+shared+ln,.05,.98),rp=clamp(ra+shared+rn,.05,.98);const lu=U(8591,seed,3,0),ru=U(8591,seed,4,0);const leftOk=lu<lp,rightOk=ru<rp;let winner='tie';if(leftOk&&!rightOk)winner='left';else if(rightOk&&!leftOk)winner='right';else if(leftOk&&rightOk)winner=la-ra>.06?'left':ra-la>.06?'right':'tie';else winner=la>=ra?'left':'right';return {left,right,site,la,ra,lp,rp,leftOk,rightOk,winner,seed};}

  const API={clamp,U,BENCHMARKS,SUITES,CANDIDATE,runSuite,shortcutEval,ARENA_POLICIES,SITES,ability,duel};
  if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.L85=API;
})(typeof window!=='undefined'?window:globalThis);
