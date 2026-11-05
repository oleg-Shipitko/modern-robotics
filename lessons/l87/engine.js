/* Урок 8.7: учебные модели продуктовой стратегии, силы свидетельств и масштабирования. */
'use strict';
(function(root){
  const clamp=(x,a,b)=>x<a?a:x>b?b:x;
  const STRATEGIES={
    vertical:{id:'vertical',name:'Вертикальная система',short:'всё внутри',profile:{capital:3,bodies:1,integration:3,ownership:3},color:'hybrid'},
    platform:{id:'platform',name:'Аппаратная платформа',short:'тело + парк',profile:{capital:2,bodies:1,integration:3,ownership:3},color:'classic'},
    brain:{id:'brain',name:'Модель для разных роботов',short:'мозг для всех',profile:{capital:2,bodies:3,integration:1,ownership:1},color:'e2e'},
    open:{id:'open',name:'Открытая экосистема',short:'общие блоки',profile:{capital:1,bodies:3,integration:1,ownership:1},color:'out'}
  };
  const SCENARIOS={
    factory:{id:'factory',name:'Склад: повторить один поток',need:{capital:2,bodies:1,integration:3,ownership:3},weights:{capital:1,bodies:1,integration:3,ownership:3}},
    home:{id:'home',name:'Дом: навыки и помощь владельцу',need:{capital:3,bodies:1,integration:2,ownership:3},weights:{capital:2,bodies:1,integration:2,ownership:3}},
    lab:{id:'lab',name:'Лаборатория: быстро менять тела',need:{capital:1,bodies:3,integration:1,ownership:1},weights:{capital:3,bodies:3,integration:1,ownership:1}}
  };
  function strategyScoreRaw(id,q){const p=STRATEGIES[id].profile;let got=0,max=0;for(const k of Object.keys(q.need)){const w=q.weights[k];got+=Math.max(0,1-Math.abs(p[k]-q.need[k])*.42)*w;max+=w}return got/max}
  function strategyScore(strategy,scenario){
    const s=STRATEGIES[strategy]||STRATEGIES.vertical,q=SCENARIOS[scenario]||SCENARIOS.factory;let got=0,max=0;const parts={};
    for(const k of Object.keys(q.need)){const w=q.weights[k],d=Math.abs(s.profile[k]-q.need[k]);const v=Math.max(0,1-d*.42);parts[k]=Math.round(v*100);got+=v*w;max+=w}
    const score=Math.round(got/max*100),best=Object.keys(STRATEGIES).sort((a,b)=>strategyScoreRaw(b,q)-strategyScoreRaw(a,q))[0];
    return{strategy:s,scenario:q,score,parts,best,pass:strategy===best};
  }
  const EVIDENCE={demo:1,pilot:2,commercial:3,repeat:4};
  const CLAIMS={
    bmw:{id:'bmw',title:'Figure 02 у BMW',text:'10 месяцев, 1 250 часов и 90 000 деталей; BMW называет программу пилотом.',level:'pilot',source:'BMW Group'},
    gxo:{id:'gxo',title:'Digit у GXO',text:'Многолетний RaaS с 2024 года; более 100 000 контейнеров и объявлен переход на новые площадки.',level:'repeat',source:'GXO + Agility'},
    unitree:{id:'unitree',title:'Unitree G1 в магазине',text:'Есть фактическая цена продажи и поставляемый продукт, но карточка не доказывает работу в процессе клиента.',level:'commercial',source:'Unitree'},
    botq:{id:'botq',title:'Темп Figure BotQ',text:'Производитель сообщил о 350 выпущенных F.03 и темпе один робот в час. Это производство, не число площадок.',level:'demo',source:'Figure'}
  };
  function classify(id,level){const c=CLAIMS[id]||CLAIMS.bmw;return{claim:c,chosen:level,correct:c.level===level,distance:Math.abs((EVIDENCE[level]||0)-EVIDENCE[c.level])}}
  function scalePlan(plan){
    const p=Object.assign({integration:0,data:0,service:0},plan||{});let sites=1,autonomy=.62,setup=12,downtime=.18;const years=[];
    for(let y=1;y<=4;y++){
      setup=Math.max(2,setup-(p.integration?2.1:.45));autonomy=Math.min(.94,autonomy+(p.data?.065:.018));downtime=Math.max(.04,downtime-(p.service?.035:.008));
      const repeat=Math.max(0,(autonomy-.55)*5+(12-setup)*.08+(.20-downtime)*4);sites+=Math.floor(repeat+.75);
      years.push({year:y,sites,autonomy,setupWeeks:setup,downtime});
    }
    const score=Math.round(sites*8+autonomy*50+(12-setup)*2+(.20-downtime)*80);
    return{plan:p,years,last:years[3],score,pass:sites>=9&&autonomy>=.82&&setup<=6&&downtime<=.10};
  }
  const API={clamp,STRATEGIES,SCENARIOS,strategyScore,EVIDENCE,CLAIMS,classify,scalePlan};
  if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.L87=API;
})(typeof window!=='undefined'?window:globalThis);
