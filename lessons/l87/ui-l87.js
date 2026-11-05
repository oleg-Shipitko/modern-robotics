'use strict';
function initNav(){const links=$$('.toc a'),ids=links.map(a=>a.getAttribute('href').slice(1));const run=()=>{const d=document.documentElement;$('#progress').style.width=(d.scrollTop/Math.max(1,d.scrollHeight-d.clientHeight)*100).toFixed(2)+'%';let cur=null;for(const id of ids){const e=$('#'+id);if(e&&e.getBoundingClientRect().top<140)cur=id}links.forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+cur))};addEventListener('scroll',run,{passive:true});run()}
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
function colors(){const s=getComputedStyle(document.documentElement),v=n=>s.getPropertyValue(n).trim();return{bg:v('--surface'),bg2:v('--surface-2'),ink:v('--ink'),ink2:v('--ink-2'),ink3:v('--ink-3'),line:v('--line'),line2:v('--line-2'),classic:v('--classic'),e2e:v('--e2e'),hybrid:v('--hybrid'),out:v('--out')||v('--classic'),good:v('--good'),bad:v('--critical')}}
function fit(cv,W,H){const d=Math.min(devicePixelRatio||1,2);if(cv.width!==W*d||cv.height!==H*d){cv.width=W*d;cv.height=H*d;cv.style.aspectRatio=`${W}/${H}`}const c=cv.getContext('2d');c.setTransform(d,0,0,d,0,0);return c}
function rr(c,x,y,w,h,r,fill,stroke,lw){c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill()}if(stroke){c.strokeStyle=stroke;c.lineWidth=lw||1;c.stroke()}}
function label(c,s,x,y,o){o=o||{};c.save();c.font=`${o.weight||600} ${o.size||12}px Inter,system-ui,sans-serif`;c.fillStyle=o.color||colors().ink;c.textAlign=o.align||'center';c.textBaseline='middle';c.fillText(s,x,y,o.max||999);c.restore()}
function line(c,a,b,col,w,dash){c.save();c.strokeStyle=col;c.lineWidth=w||2;if(dash)c.setLineDash(dash);c.beginPath();c.moveTo(a[0],a[1]);c.lineTo(b[0],b[1]);c.stroke();c.restore()}
function dot(c,x,y,r,fill,stroke){c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=1.5;c.stroke()}}
function setOut(el,html,cls){el.innerHTML=html;el.className='scene-result'+(cls?' '+cls:'')}
function mountMissions(sel,missions,api,opts){const root=$(sel),mark=i=>root.classList.toggle('m-live',!missions[i].action&&!missions[i].final),ctl=Missions.mount(root,missions,api,Object.assign({},opts,{onStep:i=>mark(i)}));mark(ctl.index);return ctl}

/* Полноширинная схема: одна матрица ответственности, без смены экранов. */
(()=>{
  const layers=['ТЕЛО','МОДЕЛЬ','ДАННЫЕ','ИНТЕГРАЦИЯ','ПАРК'];
  const rows=[
    {name:'Figure + клиент',kind:'вертикальный контур',roles:['own','own','own','partner','partner'],note:'ядро внутри Figure · площадка и приёмка совместно'},
    {name:'Agility + GXO',kind:'платформа и RaaS',roles:['own','own','partner','partner','own'],note:'Digit и сервис у Agility · складской поток у GXO'},
    {name:'Gemini + партнёр',kind:'модель для разных тел',roles:['partner','own','own','partner','client'],note:'интеллект переносится · тело и эксплуатация проверяются заново'},
    {name:'Isaac / LeRobot',kind:'открытая экосистема',roles:['partner','partner','partner','client','client'],note:'общие блоки · результат на площадке остаётся у продукта'}
  ];
  function cell(c,k,A,P,x,y,w,h,role,labelText,active){
    const own=role==='own',partner=role==='partner';
    const fill=own?A.alpha(P.spr,active ? .20 : .12):partner?P.surf:P.surf2;
    const stroke=own?P.spr:partner?P.out:P.line;
    A.rect(c,x,y,w,h,9,fill,stroke,active?1.8:1.1);
    if(partner){c.save();c.strokeStyle=P.out;c.lineWidth=1.2;c.setLineDash([5,4]);c.strokeRect(x+3,y+3,w-6,h-6);c.restore()}
    A.lab(c,k,labelText,x+w/2,y+h/2,{px:9.5,weight:780,color:own?P.spr:partner?P.out:P.ink3,halo:false});
  }
  function draw(c,k,t,P,A,g){
    c.fillStyle=P.surf;c.fillRect(0,0,g.W,g.H);
    const n=g.W<600,phase=Math.floor((t%16)/4),travel=(t%4)/4;
    A.lab(c,k,'КТО ЗАМЫКАЕТ ПУТЬ ОТ ОТКАЗА ДО ОБНОВЛЕНИЯ',g.W/2,25,{px:n?11.5:14,weight:850,color:P.ink,halo:false});
    A.lab(c,k,'одни и те же пять обязанностей · разные границы ответственности',g.W/2,48,{px:n?8.5:10.5,color:P.ink3,halo:false});
    if(n){
      const x=18,w=324,cellW=59,gap=5;
      rows.forEach((r,i)=>{
        const y=79+i*126,active=i===phase;
        A.rect(c,x,y,w,112,13,active?A.alpha(P.spr,.06):P.surf,P.line,active?1.7:1);
        A.lab(c,k,r.name,x+13,y+18,{align:'left',px:11,weight:820,color:active?P.spr:P.ink,halo:false});
        A.lab(c,k,r.kind,x+w-13,y+18,{align:'right',px:8.5,color:P.ink3,halo:false});
        r.roles.forEach((role,j)=>cell(c,k,A,P,x+12+j*(cellW+gap),y+36,cellW,32,role,layers[j].slice(0,5),active));
        A.lab(c,k,r.note,x+13,y+89,{align:'left',px:8.3,color:P.ink3,halo:false});
        if(active){const px=x+12+(4-travel*4)*(cellW+gap)+cellW/2;A.circle(c,px,y+72,5,P.bad,P.surf,2)}
      });
      A.lab(c,k,'● свой слой   ◌ партнёр   □ клиент / интегратор',g.W/2,597,{px:9,color:P.ink3,halo:false});
      return;
    }
    const labelW=195,x0=214,cellW=154,gap=8;
    layers.forEach((z,j)=>A.lab(c,k,z,x0+j*(cellW+gap)+cellW/2,82,{px:10,weight:820,color:P.ink3,halo:false}));
    rows.forEach((r,i)=>{
      const y=104+i*68,active=i===phase;
      if(active)A.rect(c,18,y-7,g.W-36,62,12,A.alpha(P.spr,.055),P.spr,1.4);
      A.lab(c,k,r.name,28,y+13,{align:'left',px:11.5,weight:830,color:active?P.spr:P.ink,halo:false});
      A.lab(c,k,r.kind,28,y+34,{align:'left',px:9,color:P.ink3,halo:false});
      r.roles.forEach((role,j)=>cell(c,k,A,P,x0+j*(cellW+gap),y,cellW,42,role,'',active));
      if(active){
        const px=x0+(4-travel*4)*(cellW+gap)+cellW/2;
        A.circle(c,px,y+21,6,P.bad,P.surf,2);
      }
    });
    const active=rows[phase];
    A.rect(c,154,382,g.W-308,40,11,A.alpha(P.spr,.08),P.spr,1.2);
    A.lab(c,k,active.note,g.W/2,402,{px:11,weight:740,color:P.spr,halo:false});
    A.lab(c,k,'сплошная ячейка — поставщик · контур — партнёр · серая — клиент или интегратор',g.W/2,359,{px:9.5,color:P.ink3,halo:false});
  }
  const wide={W:1120,H:440},narrow={W:360,H:620};
  Anim.add('market-stack',{W:wide.W,H:wide.H,start:.4,narrowAt:600,draw(c,k,t,P,A){draw(c,k,t,P,A,wide)},narrow:{W:narrow.W,H:narrow.H,draw(c,k,t,P,A){draw(c,k,t,P,A,narrow)}}});
})();

function drawStrategyIcon(c,id,x,y,w,h,P){
  rr(c,x,y,w,h,14,P.bg,P.line,1);
  if(id==='factory'){
    label(c,'СКЛАД',x+w/2,y+24,{size:10,weight:850,color:P.ink3});
    line(c,[x+24,y+h-45],[x+w-24,y+h-45],P.line2,7);
    for(let i=0;i<4;i++)rr(c,x+34+i*35,y+h-66,24,20,4,i%2?P.classic+'22':P.hybrid+'22',i%2?P.classic:P.hybrid,1);
    rr(c,x+34,y+48,w-68,58,8,P.bg2,P.line,1);
    for(let i=0;i<3;i++){line(c,[x+48,y+62+i*15],[x+w-48,y+62+i*15],P.line2,1);dot(c,x+61+i*36,y+62+i*15,4,P.good)}
  }else if(id==='home'){
    label(c,'ДОМ',x+w/2,y+24,{size:10,weight:850,color:P.ink3});
    c.save();c.strokeStyle=P.hybrid;c.lineWidth=2;c.beginPath();c.moveTo(x+35,y+88);c.lineTo(x+w/2,y+45);c.lineTo(x+w-35,y+88);c.stroke();c.restore();
    rr(c,x+51,y+87,w-102,92,5,P.hybrid+'12',P.hybrid,1.5);
    rr(c,x+w/2-15,y+129,30,50,4,P.bg,P.line,1);
    dot(c,x+w/2+8,y+154,2,P.hybrid);
    rr(c,x+72,y+104,35,26,4,P.classic+'16',P.classic,1);
  }else{
    label(c,'ЛАБОРАТОРИЯ',x+w/2,y+24,{size:10,weight:850,color:P.ink3});
    for(let i=0;i<3;i++){
      const cx=x+48+i*48;
      rr(c,cx-20,y+118,40,50,6,P.bg2,P.line,1);
      line(c,[cx,y+118],[cx-8,y+91],i===1?P.hybrid:P.classic,4);
      line(c,[cx-8,y+91],[cx+8,y+72],i===1?P.hybrid:P.classic,4);
      dot(c,cx+8,y+72,6,P.e2e);
    }
  }
}

function drawStrategy(cv,S){
  const n=cv.clientWidth<560,W=n?360:760,H=n?520:410,c=fit(cv,W,H),P=colors();
  const r=S.last||L87.strategyScore(S.strategy,S.scenario),prof=r.strategy.profile;
  const keys=['capital','bodies','integration','ownership'];
  const names=['доступный капитал','смена тел','интеграция процесса','единый владелец'];
  c.fillStyle=P.bg2;c.fillRect(0,0,W,H);
  label(c,r.scenario.name,W/2,27,{size:n?12:14,weight:830,color:P.ink});
  if(n){
    drawStrategyIcon(c,r.scenario.id,20,51,320,190,P);
    const top=258;
    keys.forEach((key,i)=>{
      const x=20+(i%2)*165,y=top+Math.floor(i/2)*92,w=155,need=r.scenario.need[key],got=prof[key],ok=Math.abs(need-got)===0;
      rr(c,x,y,w,80,11,P.bg,ok?P.good:P.line,ok?1.4:1);
      label(c,names[i],x+10,y+17,{align:'left',size:9.3,weight:760,color:P.ink2});
      label(c,`нужно ${need} · контур ${got}`,x+10,y+39,{align:'left',size:9,color:P.ink3});
      for(let j=0;j<3;j++)dot(c,x+18+j*20,y+61,5,j<got?P.hybrid:P.bg2,P.line);
      label(c,ok?'✓':'△',x+w-18,y+61,{size:13,weight:850,color:ok?P.good:P.bad});
    });
    rr(c,20,454,320,46,11,r.pass?P.good+'12':P.bad+'10',r.pass?P.good:P.bad,1.2);
    label(c,`${r.strategy.name} · ${r.score}%`,W/2,477,{size:11,weight:800,color:r.pass?P.good:P.bad});
    return;
  }
  drawStrategyIcon(c,r.scenario.id,24,57,218,296,P);
  const x0=264,y0=67,w=229,h=126,gap=12;
  keys.forEach((key,i)=>{
    const x=x0+(i%2)*(w+gap),y=y0+Math.floor(i/2)*(h+gap),need=r.scenario.need[key],got=prof[key],delta=Math.abs(need-got),ok=delta===0;
    rr(c,x,y,w,h,13,P.bg,ok?P.good:P.line,ok?1.5:1);
    label(c,names[i],x+14,y+22,{align:'left',size:10.5,weight:780,color:P.ink2});
    label(c,'требование',x+14,y+51,{align:'left',size:8.5,color:P.ink3});
    label(c,'контур',x+14,y+83,{align:'left',size:8.5,color:P.ink3});
    for(let j=0;j<3;j++){
      dot(c,x+98+j*30,y+51,6,j<need?P.classic:P.bg2,P.line);
      dot(c,x+98+j*30,y+83,6,j<got?P.hybrid:P.bg2,P.line);
    }
    label(c,ok?'совпало':delta===1?'граница':'разрыв',x+w-14,y+106,{align:'right',size:9,weight:800,color:ok?P.good:P.bad});
  });
  rr(c,264,349,470,42,11,r.pass?P.good+'12':P.bad+'10',r.pass?P.good:P.bad,1.2);
  label(c,`${r.strategy.name} · совпадение ${r.score}%`,499,370,{size:11.5,weight:820,color:r.pass?P.good:P.bad});
}
function initStrategy(){const S={strategy:'vertical',scenario:'factory',last:null},cv=$('#strategyCv'),out=$('#strategyResult');function render(){drawStrategy(cv,S);$$('#strategyCtl button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===S.strategy)))}function set(v){S.strategy=v;S.last=null;render();setOut(out,'Стратегия выбрана. Запусти сценарий, чтобы увидеть узкое место.')}async function run(){S.last=L87.strategyScore(S.strategy,S.scenario);render();await sleep(reduced()?0:260);setOut(out,S.last.pass?`Подходит: ${S.last.strategy.name.toLowerCase()} замыкает главный цикл этого сценария.`:`Баланс ${S.last.score}%. Здесь лучше работает «${L87.STRATEGIES[S.last.best].name}»: сравни выделенное требование с возможностями.`,S.last.pass?'good':'bad');return S.last}$('#strategyCtl').onclick=e=>{const b=e.target.closest('button');if(b)set(b.dataset.v)};addEventListener('resize',render,{passive:true});new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});const api={reset(){S.strategy='vertical';S.scenario='factory';S.last=null;render()},state(){return S},set,run};const missions=[
  {short:'Склад',title:'Закрой ответственность за одну смену',text:'Склад повторяет один поток контейнеров. Выбери контур, который владеет телом, интеграцией и эксплуатацией.',controls:'all',onEnter(){S.scenario='factory';set('vertical')},bet:{q:'Какая стратегия окажется ближе?',options:['Аппаратная платформа','Мозг для всех','Открытая экосистема'],answer:r=>r.best==='platform'?0:r.best==='brain'?1:2},action:{label:'Запустить склад',run},criteria:[{label:'Выбрана стратегия с интеграцией и владельцем парка',test:r=>r.pass}],summary:r=>`${r.strategy.name}: ${r.score}%`,explain:()=> 'Для одного повторяемого потока главными стали интеграция и эксплуатационная ответственность. Общая модель без владельца площадки не закрывает этот договор.'},
  {short:'Дом',title:'Собери долгий цикл домашнего продукта',text:'Дом меняется каждый день. Нужны своё тело, данные от использования, обновления и помощь владельцу.',controls:'all',onEnter(){S.scenario='home';set('platform')},action:{label:'Запустить домашний продукт',run},criteria:[{label:'Один владелец связывает тело, модель, данные и помощь',test:r=>r.pass}],summary:r=>`${r.strategy.name}: ${r.score}%`,explain:()=> 'Дом требует длинной обратной связи от нового отказа до обновления продукта. Вертикальная система дороже, зато не теряет ответственность на границах.'},
  {short:'Лаборатория',title:'Снизь цену первого эксперимента',text:'Команда меняет роботов и публикует результат. Фабрики нет; важны разные тела и воспроизводимость.',controls:'all',onEnter(){S.scenario='lab';set('vertical')},action:{label:'Запустить исследование',run},criteria:[{label:'Стратегия поддерживает разные тела при малом капитале',test:r=>r.pass}],summary:r=>`${r.strategy.name}: ${r.score}%`,explain:()=> 'Открытая экосистема даёт общие интерфейсы и инструменты. Она не становится службой эксплуатации, но для исследования это не главное ограничение.'},
  {short:'Свободно',title:'Сравни компромиссы',text:'Переключай стратегии на последнем сценарии. Смотри не только итог, но и свойство, на котором появляется разрыв.',controls:'all',final:true}
];mountMissions('#strategyMis',missions,api,{controls:{strategy:'#strategyCtl'},scene:'#strategyCv'});render();return api}

function initEvidence(){const order=['bmw','gxo','unitree','botq'],S={claim:'bmw',level:'demo',last:null},card=$('#claimCard'),out=$('#evidenceResult');function render(){const c=L87.CLAIMS[S.claim];card.innerHTML=`<h4>${c.title}</h4><p>${c.text}</p><small>Источник: ${c.source}</small>`;$$('#evidenceCtl button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===S.level)))}function setClaim(id){S.claim=id;S.level='demo';S.last=null;render();setOut(out,'Выбери максимальную доказанную ступень.')}function setLevel(v){S.level=v;S.last=null;render()}function run(){S.last=L87.classify(S.claim,S.level);setOut(out,S.last.correct?'Граница выбрана точно.':`Слишком ${L87.EVIDENCE[S.level]>L87.EVIDENCE[S.last.claim.level]?'сильный':'слабый'} вывод: верная ступень — ${S.last.claim.level}.`,S.last.correct?'good':'bad');return S.last}$('#evidenceCtl').onclick=e=>{const b=e.target.closest('button');if(b)setLevel(b.dataset.v)};const api={reset(){setClaim('bmw')},state(){return S},setClaim,setLevel,run};const missions=[
  {short:'Пилот',title:'Не превращай длительный опыт в продажу',text:'Прочитай данные BMW и выбери максимальную ступень.',controls:'all',onEnter(){setClaim('bmw')},bet:{q:'Длительность автоматически делает опыт коммерческим?',options:['Да','Нет'],answer:()=>1},action:{label:'Проверить границу',run},criteria:[{label:'BMW остаётся пилотом у клиента',test:r=>r.correct&&r.chosen==='pilot'}],summary:r=>r.claim.title,explain:()=> 'Ты сохранил формулировку партнёра. 1 250 часов усиливают пилот, но не добавляют нераскрытый договор продажи.'},
  {short:'RaaS',title:'Найди повторяемое развёртывание',text:'В карточке GXO есть договор, работающий процесс и перенос на новые площадки.',controls:'all',onEnter(){setClaim('gxo')},action:{label:'Проверить GXO',run},criteria:[{label:'Коммерческая работа дополнена повторением',test:r=>r.correct&&r.chosen==='repeat'}],summary:r=>r.claim.title,explain:()=> 'Здесь свидетельство сильнее одного коммерческого договора: тот же продукт расширяется на другие площадки.'},
  {short:'Цена',title:'Не путай доступный корпус с готовым процессом',text:'Unitree G1 продаётся по фактической цене. Какой вывод поддерживает только эта карточка?',controls:'all',onEnter(){setClaim('unitree')},action:{label:'Проверить продажу',run},criteria:[{label:'Подтверждён коммерческий продукт, но не парк клиента',test:r=>r.correct&&r.chosen==='commercial'}],summary:r=>r.claim.title,explain:()=> 'Фактическая продажа сильнее целевой цены. Однако она не сообщает, какую задачу робот автономно выполняет у клиента.'},
  {short:'Фабрика',title:'Отдели производство от эксплуатации',text:'Темп фабрики говорит, сколько корпусов можно выпускать. Он не говорит, сколько работает у клиентов.',controls:'all',onEnter(){setClaim('botq')},action:{label:'Проверить производство',run},criteria:[{label:'Производственный факт не повышен до развёртывания',test:r=>r.correct&&r.chosen==='demo'}],summary:r=>r.claim.title,explain:()=> 'Производство — важная готовность поставщика, но рыночная лестница требует отдельного свидетельства площадки и задачи.'},
  {short:'Свободно',title:'Перечитай четыре границы',text:'Переключай ступени на последней карточке и сформулируй, какого факта не хватает до следующей.',controls:'all',final:true}
];mountMissions('#evidenceMis',missions,api,{controls:{ladder:'#evidenceCtl'},scene:'#claimCard'});render();return api}

function drawSite(c,x,y,i,P,on){
  rr(c,x-15,y-12,30,24,4,on?P.hybrid+'18':P.bg,on?P.hybrid:P.line,1);
  line(c,[x-18,y-12],[x,y-25],on?P.hybrid:P.line,1.5);
  line(c,[x,y-25],[x+18,y-12],on?P.hybrid:P.line,1.5);
  rr(c,x-4,y+1,8,11,2,on?P.hybrid:P.line,on?P.hybrid:P.line,1);
  label(c,String(i),x,y+27,{size:8,weight:800,color:on?P.hybrid:P.ink3});
}

function drawScale(cv,r){
  const n=cv.clientWidth<560,W=n?360:760,H=n?520:400,c=fit(cv,W,H),P=colors();
  c.fillStyle=P.bg2;c.fillRect(0,0,W,H);
  label(c,'От первого пилота к повторяемой сети',W/2,25,{size:n?12:14,weight:830,color:P.ink});
  if(n){
    const ys=[72,158,244,330];
    r.years.forEach((z,i)=>{
      const y=ys[i];
      rr(c,20,y-25,320,68,12,P.bg,P.line,1);
      label(c,`ГОД ${z.year}`,36,y-7,{align:'left',size:9,weight:850,color:P.ink3});
      label(c,`${z.sites} площадок`,36,y+19,{align:'left',size:12,weight:820,color:P.hybrid});
      const count=Math.min(6,z.sites);
      for(let j=0;j<count;j++)drawSite(c,190+j*23,y+3,j+1,P,true);
      if(i<3)line(c,[W/2,y+43],[W/2,ys[i+1]-25],P.hybrid,1.5,[4,4]);
    });
    const plan=r.plan;
    [['интеграция',plan.integration],['данные',plan.data],['сервис',plan.service]].forEach((z,i)=>{
      rr(c,20+i*108,426,100,48,9,z[1]?P.good+'12':P.bad+'0d',z[1]?P.good:P.line,1);
      label(c,z[0],70+i*108,444,{size:9.5,weight:780,color:z[1]?P.good:P.ink3});
      label(c,z[1]?'закрыто':'узкое место',70+i*108,461,{size:8,color:z[1]?P.good:P.bad});
    });
    return;
  }
  const centers=[[90,125],[268,125],[446,125],[624,125]];
  centers.forEach((p,i)=>{
    const z=r.years[i];
    rr(c,p[0]-76,59,152,199,14,P.bg,P.line,1);
    label(c,`ГОД ${z.year}`,p[0],80,{size:9.5,weight:850,color:P.ink3});
    label(c,`${z.sites} площадок`,p[0],103,{size:12,weight:820,color:P.hybrid});
    const count=Math.min(9,z.sites);
    for(let j=0;j<count;j++)drawSite(c,p[0]-44+(j%3)*44,145+Math.floor(j/3)*55,j+1,P,true);
    if(i<3)line(c,[p[0]+76,159],[centers[i+1][0]-76,159],P.hybrid,2,[5,4]);
  });
  const plan=r.plan,items=[['ИНТЕГРАЦИЯ',plan.integration,`запуск ${r.last.setupWeeks.toFixed(1)} нед.`],['ДАННЫЕ',plan.data,`автономность ${Math.round(r.last.autonomy*100)}%`],['СЕРВИС',plan.service,`простой ${Math.round(r.last.downtime*100)}%`]];
  items.forEach((z,i)=>{
    const x=18+i*246;
    rr(c,x,286,232,80,12,z[1]?P.good+'10':P.bad+'0b',z[1]?P.good:P.line,1.2);
    label(c,z[0],x+14,309,{align:'left',size:9.5,weight:840,color:z[1]?P.good:P.ink3});
    label(c,z[2],x+14,339,{align:'left',size:12,weight:800,color:z[1]?P.good:P.bad});
    label(c,z[1]?'контур замкнут':'ограничивает рост',x+218,353,{align:'right',size:8.5,color:z[1]?P.good:P.bad});
  });
}
function initScale(){const S={integration:false,data:false,service:false,last:null},cv=$('#scaleCv'),out=$('#scaleResult');function calc(){S.last=L87.scalePlan(S);return S.last}function render(){const r=calc();drawScale(cv,r);$('#mSites').textContent=r.last.sites;$('#mAuto').textContent=Math.round(r.last.autonomy*100)+'%';$('#mSetup').textContent=r.last.setupWeeks.toFixed(1)+' нед.';$('#mDown').textContent=Math.round(r.last.downtime*100)+'%';$$('#scaleCtl input').forEach(x=>x.checked=!!S[x.value])}function set(v){Object.assign(S,v);render();setOut(out,'План изменён. Запусти четыре года, чтобы проверить узкое место.')}async function run(){const r=calc(),steps=reduced()?1:4;for(let i=0;i<steps;i++){drawScale(cv,{...r,years:r.years.slice(0,i+1).concat(Array(3-i).fill(r.years[i]))});if(steps>1)await sleep(150)}render();const missing=['integration','data','service'].filter(k=>!S[k]);setOut(out,r.pass?'Парк повторяется: запуск короче шести недель, автономность выше 82%, простой не больше 10%.':`Масштаб остановился. Не закрыто: ${missing.map(k=>({integration:'интеграция',data:'данные отказов',service:'сервис'}[k])).join(', ')}.`,r.pass?'good':'bad');return r}$('#scaleCtl').onchange=e=>{const x=e.target.closest('input');if(x)set({[x.value]:x.checked})};addEventListener('resize',render,{passive:true});new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});const api={reset(){Object.assign(S,{integration:false,data:false,service:false});render()},state(){return S},set,run};const missions=[
  {short:'Подключение',title:'Сделай вторую площадку конфигурацией',text:'Включи стандартизацию интеграции и запусти модель.',controls:'all',onEnter(){set({integration:false,data:false,service:false})},action:{label:'Провести четыре года',run},criteria:[{label:'Срок запуска уменьшается',test:r=>r.plan.integration&&r.last.setupWeeks<6}],summary:r=>`${r.last.setupWeeks.toFixed(1)} недели на запуск`,explain:()=> 'Шаблон подключения убрал повторную разработку. Но автономность и простой всё ещё ограничивают число площадок.'},
  {short:'Данные',title:'Верни отказы в обучение',text:'Сохрани интеграцию и добавь контур эксплуатационных данных.',controls:'all',onEnter(){set({integration:true,data:false,service:false})},action:{label:'Пересчитать парк',run},criteria:[{label:'Автономность достигает 82%',test:r=>r.plan.data&&r.last.autonomy>=.82}],summary:r=>`${Math.round(r.last.autonomy*100)}% автономности`,explain:()=> 'Теперь следующий выпуск знает отказы текущего парка. Площадки растут быстрее, но простой всё ещё съедает смены.'},
  {short:'Сервис',title:'Закрой физический простой',text:'Добавь диагностику, запасные части и помощь площадке.',controls:'all',onEnter(){set({integration:true,data:true,service:false})},action:{label:'Масштабировать продукт',run},criteria:[{label:'Все три слоя включены',test:r=>r.pass},{label:'Не меньше девяти площадок',test:r=>r.last.sites>=9}],summary:r=>`${r.last.sites} площадок · простой ${Math.round(r.last.downtime*100)}%`,explain:()=> 'Только совместная работа интеграции, данных и сервиса превратила первый пилот в повторяемый продукт.'},
  {short:'Свободно',title:'Убери один слой и найди предел',text:'Выключай инвестиции по одной. Смотри, какая метрика первой перестаёт проходить.',controls:'all',final:true}
];mountMissions('#scaleMis',missions,api,{controls:{plan:'#scaleCtl'},scene:'#scaleCv'});render();return api}

function initQuiz(){const Q=[
  {q:'Что означает стратегия компании в этом уроке?',o:['Её оценку инвесторами','Какой продуктовый цикл она замыкает и за какие слои отвечает','Количество роликов'],a:1,e:'Стратегия связывает тело, интеллект, данные, интеграцию и эксплуатацию.'},
  {q:'Почему модель для разных роботов не является готовым продуктом на каждом теле?',o:['Нужны адаптер действий, задержка, безопасность и испытания конкретного робота','Модель нельзя переносить','У роботов нет камер'],a:0,e:'Общий интеллект сокращает часть работы, но последний метр остаётся у конкретной системы.'},
  {q:'BMW сообщает 1 250 часов работы Figure 02 и называет программу пилотом. Как её описать?',o:['Коммерческий парк','Длительный пилот','Массовая продажа'],a:1,e:'Длительность усиливает свидетельство пилота, но не меняет названный тип договора.'},
  {q:'Что делает случай Digit у GXO сильнее одного пилота?',o:['Известный бренд','RaaS, работающий процесс и объявленное расширение на новые площадки','Гуманоидная форма'],a:1,e:'Повторение продукта и службы эксплуатации проверяет масштабируемость.'},
  {q:'Фабрика выпустила 350 роботов. Что из этого следует?',o:['350 роботов автономно работают у клиентов','Подтверждён производственный выпуск, но не клиентские площадки','Робот окупился'],a:1,e:'Производство и эксплуатация требуют разных свидетельств.'},
  {q:'В чём сила открытой экосистемы?',o:['Она автоматически отвечает за простой','Она снижает вход и улучшает воспроизводимость через общие блоки','Она отменяет интеграцию'],a:1,e:'Открытость ускоряет проверку и перенос, но продукту всё равно нужен владелец.'},
  {q:'Что первым показывает переход от проекта к продукту?',o:['Новая площадка запускается конфигурацией быстрее первой','Ролик стал длиннее','В презентации больше партнёров'],a:0,e:'Повторяемость интеграции, данных и сервиса важнее единичного героического запуска.'},
  {q:'Как читать целевую цену Tesla Optimus $20–30 тысяч?',o:['Как состоявшуюся внешнюю продажу','Как прогноз производителя при будущем масштабе','Как цену RaaS'],a:1,e:'Целевая и фактическая цены принадлежат разным ступеням свидетельств.'}
];const box=$('#quizBox');let n=0,ok=0;Q.forEach((q,i)=>{const card=h('div',{class:'card q-card'},h('h4',null,h('span',{class:'qn'},`${i+1}.`),h('span',null,q.q))),opts=h('div',{class:'q-opts'}),exp=h('div',{class:'q-exp',hidden:true});q.o.forEach((o,j)=>{const b=h('button',{type:'button',class:'q-opt'},o);b.onclick=()=>{if(card.dataset.done)return;card.dataset.done='1';const yes=j===q.a;b.classList.add(yes?'correct':'incorrect');if(!yes)$$('.q-opt',opts)[q.a].classList.add('correct');exp.innerHTML=`<strong>${yes?'Верно.':'Не совсем.'}</strong> ${q.e}`;exp.hidden=false;n++;if(yes)ok++;$('#quizScore').textContent=n===Q.length?`Итог: ${ok} из ${Q.length}. ${ok>=6?'Можно идти дальше.':'Вернись к разделам с ошибками.'}`:`Отвечено ${n} из ${Q.length}`};opts.append(b)});card.append(opts,exp);box.append(card)})}
(function boot(){const start=()=>{initTheme();initNav();const mis={strategy:initStrategy(),evidence:initEvidence(),scale:initScale()};initQuiz();const n=['strategyMis','evidenceMis','scaleMis'].reduce((s,id)=>s+Math.max(0,$$('#'+id+' .g-steps li').length-1),0);$('#heroMis').textContent=`${n} миссий с целью`;window.__l87={mis,L87};window.__lessonReady=true};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start()})();
