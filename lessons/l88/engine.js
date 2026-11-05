/* Урок 8.8: прозрачная учебная экономика успешной задачи. */
'use strict';
(function(root){
  const clamp=(x,a,b)=>x<a?a:x>b?b:x;
  const USE_CASES={
    totes:{id:'totes',name:'Контейнеры на конвейер',cycleSec:78,humanCycle:62,success:.98,utilization:.84,helpEvery:180,helpMin:4,quality:true,safety:true},
    machine:{id:'machine',name:'Обслуживание станка',cycleSec:210,humanCycle:180,success:.96,utilization:.76,helpEvery:90,helpMin:8,quality:true,safety:true},
    laundry:{id:'laundry',name:'Сортировка белья',cycleSec:165,humanCycle:125,success:.82,utilization:.42,helpEvery:22,helpMin:5,quality:true,safety:true},
    repair:{id:'repair',name:'Нестандартный ремонт',cycleSec:720,humanCycle:420,success:.58,utilization:.18,helpEvery:4,helpMin:28,quality:false,safety:false}
  };
  function economics(o){
    o=Object.assign({hoursMonth:320,cycleSec:90,success:.9,utilization:.7,helpEvery:50,helpMin:6,operatorRate:32,purchase:120000,lifeMonths:60,deploy:20000,service:1800,energy:240,compute:600,humanRate:35,humanCycle:70},o||{});
    const attempts=o.hoursMonth*3600/o.cycleSec*o.utilization,successes=attempts*o.success,interventions=attempts/Math.max(1,o.helpEvery),helpHours=interventions*o.helpMin/60;
    const capital=o.purchase/Math.max(1,o.lifeMonths)+o.deploy/Math.max(1,o.lifeMonths),helpCost=helpHours*o.operatorRate,total=capital+o.service+o.energy+o.compute+helpCost,costTask=total/Math.max(1,successes);
    const humanTasks=o.hoursMonth*3600/o.humanCycle,humanCost=o.hoursMonth*o.humanRate,humanCostTask=humanCost/Math.max(1,humanTasks),monthlyValue=successes*humanCostTask-total,payback=monthlyValue>0?(o.purchase+o.deploy)/monthlyValue:Infinity;
    return{input:o,attempts,successes,interventions,helpHours,capital,helpCost,total,costTask,humanTasks,humanCost,humanCostTask,monthlyValue,payback,pass:costTask<humanCostTask};
  }
  function runCase(id,overrides){const u=USE_CASES[id]||USE_CASES.totes;return Object.assign(economics(Object.assign({},u,overrides||{})),{useCase:u,eligible:u.quality&&u.safety})}
  function portfolio(ids,budget){ids=ids||[];budget=budget||480000;const rows=ids.map(id=>runCase(id)),eligible=rows.filter(r=>r.eligible&&r.monthlyValue>0).sort((a,b)=>b.monthlyValue-a.monthlyValue);let left=budget,total=0;const chosen=[];for(const r of eligible){const need=r.input.purchase+r.input.deploy;if(need<=left){left-=need;total+=r.monthlyValue;chosen.push(r.useCase.id)}}return{rows,budget,left,total,chosen,pass:chosen.includes('totes')&&!chosen.includes('repair')}}
  const API={clamp,USE_CASES,economics,runCase,portfolio};if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.L88=API;
})(typeof window!=='undefined'?window:globalThis);
