'use strict';
function initNav(){const links=$$('.toc a'),ids=links.map(a=>a.getAttribute('href').slice(1));const run=()=>{const d=document.documentElement;$('#progress').style.width=(d.scrollTop/Math.max(1,d.scrollHeight-d.clientHeight)*100).toFixed(2)+'%';let cur=null;for(const id of ids){const e=$('#'+id);if(e&&e.getBoundingClientRect().top<140)cur=id}links.forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+cur))};addEventListener('scroll',run,{passive:true});run()}
const money=v=>Number.isFinite(v)?'$'+Math.abs(v).toLocaleString('ru-RU',{maximumFractionDigits:v<100?2:0}).replace(/,/g,' '):'—',sleep=ms=>new Promise(r=>setTimeout(r,ms)),reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
function colors(){const s=getComputedStyle(document.documentElement),v=n=>s.getPropertyValue(n).trim();return{bg:v('--surface'),bg2:v('--surface-2'),ink:v('--ink'),ink2:v('--ink-2'),ink3:v('--ink-3'),line:v('--line'),line2:v('--line-2'),classic:v('--classic'),e2e:v('--e2e'),hybrid:v('--hybrid'),out:v('--out')||v('--classic'),good:v('--good'),bad:v('--critical')}}
function fit(cv,W,H){const d=Math.min(devicePixelRatio||1,2);if(cv.width!==W*d||cv.height!==H*d){cv.width=W*d;cv.height=H*d;cv.style.aspectRatio=`${W}/${H}`}const c=cv.getContext('2d');c.setTransform(d,0,0,d,0,0);return c}
function rr(c,x,y,w,h,r,fill,stroke,lw){c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill()}if(stroke){c.strokeStyle=stroke;c.lineWidth=lw||1;c.stroke()}}
function label(c,s,x,y,o){o=o||{};c.save();c.font=`${o.weight||600} ${o.size||12}px Inter,system-ui,sans-serif`;c.fillStyle=o.color||colors().ink;c.textAlign=o.align||'center';c.textBaseline='middle';c.fillText(s,x,y,o.max||999);c.restore()}
function line(c,a,b,col,w,dash){c.save();c.strokeStyle=col;c.lineWidth=w||2;if(dash)c.setLineDash(dash);c.beginPath();c.moveTo(a[0],a[1]);c.lineTo(b[0],b[1]);c.stroke();c.restore()}
function dot(c,x,y,r,fill,stroke){c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=1.5;c.stroke()}}
function setOut(el,html,cls){el.innerHTML=html;el.className='scene-result'+(cls?' '+cls:'')}
function mountMissions(sel,missions,api,opts){const root=$(sel),mark=i=>root.classList.toggle('m-live',!missions[i].action&&!missions[i].final),ctl=Missions.mount(root,missions,api,Object.assign({},opts,{onStep:i=>mark(i)}));mark(ctl.index);return ctl}

/* Полноширинная схема: один и тот же месяц остаётся на экране целиком. */
(()=>{
  const costs=[
    ['КАПИТАЛ','корпус · внедрение',.30],
    ['СЕРВИС','ремонт · ПО',.20],
    ['ВЫЧИСЛЕНИЯ','инференс · связь',.14],
    ['ЭНЕРГИЯ','зарядка',.08],
    ['ПОМОЩЬ','время оператора',.28]
  ];
  function costLedger(c,k,P,A,x,y,w,h,active){
    A.rect(c,x,y,w,h,14,P.surf,P.line,1.2);
    A.lab(c,k,'ПОЛНАЯ СТОИМОСТЬ МЕСЯЦА',x+w/2,y+25,{px:10.5,weight:850,color:P.ink3,halo:false});
    let yy=y+52;
    costs.forEach((z,i)=>{
      const hh=(h-76)*z[2];
      A.rect(c,x+24,yy,w-48,Math.max(20,hh-4),7,A.alpha(i===4?P.mot:P.spr,.10),i===4?P.mot:P.spr,1);
      A.lab(c,k,z[0],x+38,yy+Math.max(20,hh-4)/2,{align:'left',px:9.5,weight:820,color:i===4?P.mot:P.spr,halo:false});
      A.lab(c,k,z[1],x+w-38,yy+Math.max(20,hh-4)/2,{align:'right',px:8.5,color:P.ink3,halo:false});
      if(i===active)A.circle(c,x+w-17,yy+Math.max(20,hh-4)/2,5,i===4?P.mot:P.spr,P.surf,2);
      yy+=Math.max(20,hh);
    });
  }
  function taskBoard(c,k,P,A,x,y,w,h){
    const narrow=w<400;
    A.rect(c,x,y,w,h,14,P.surf,P.line,1.2);
    A.lab(c,k,'ПОПЫТКИ ЗА МЕСЯЦ',x+w/2,y+25,{px:10.5,weight:850,color:P.ink3,halo:false});
    for(let i=0;i<40;i++){
      const col=i%10,row=Math.floor(i/10),xx=x+30+col*((w-60)/9),yy=y+55+row*(narrow?27:36);
      const fail=i===4||i===13||i===27||i===36,help=i===9||i===21||i===33;
      A.rect(c,xx-10,yy-10,20,20,5,A.alpha(fail?P.bad:help?P.mot:P.good,.13),fail?P.bad:help?P.mot:P.good,1.1);
      if(fail)A.lab(c,k,'×',xx,yy+1,{px:10,weight:850,color:P.bad,halo:false});
      if(help)A.lab(c,k,'!',xx,yy+1,{px:10,weight:850,color:P.mot,halo:false});
    }
    A.lab(c,k,'успех · входит в знаменатель',x+24,y+h-(narrow?65:45),{align:'left',px:9,color:P.good,halo:false});
    A.lab(c,k,'× неудача · оплачена, но не входит',x+24,y+h-(narrow?45:25),{align:'left',px:9,color:P.bad,halo:false});
    A.lab(c,k,'! помощь · добавляет труд в стоимость',narrow?x+24:x+w-24,y+h-25,{align:narrow?'left':'right',px:9,color:P.mot,halo:false});
  }
  function draw(c,k,t,P,A,g){
    c.fillStyle=P.surf;c.fillRect(0,0,g.W,g.H);
    const n=g.W<600,active=Math.floor((t%5)),u=(t%5)-active;
    A.lab(c,k,'СТОИМОСТЬ УСПЕШНОЙ ЗАДАЧИ',g.W/2,26,{px:n?12:15,weight:850,color:P.ink,halo:false});
    A.lab(c,k,'все расходы месяца делятся только на результаты нужного качества',g.W/2,49,{px:n?8.6:10.5,color:P.ink3,halo:false});
    if(n){
      costLedger(c,k,P,A,20,74,320,265,active);
      A.lab(c,k,'÷',g.W/2,363,{px:24,weight:850,color:P.ink2,halo:false});
      taskBoard(c,k,P,A,20,389,320,230);
      A.rect(c,34,636,292,42,11,A.alpha(P.spr,.09),P.spr,1.3);
      A.lab(c,k,'$ за одну успешную задачу',g.W/2,657,{px:12,weight:850,color:P.spr,halo:false});
      return;
    }
    costLedger(c,k,P,A,30,78,420,278,active);
    taskBoard(c,k,P,A,670,78,420,278);
    A.arrow(c,466,217,648,217,P.ink3,2,8);
    A.lab(c,k,'÷',557,190,{px:26,weight:850,color:P.ink2,halo:false});
    const tokenX=466+(648-466)*u;
    A.circle(c,tokenX,217,6,active===4?P.mot:P.spr,P.surf,2);
    A.rect(c,300,382,520,42,11,A.alpha(P.spr,.09),P.spr,1.3);
    A.lab(c,k,'ПОЛНАЯ СТОИМОСТЬ ÷ УСПЕШНЫЕ ЗАДАЧИ = $ ЗА РЕЗУЛЬТАТ',g.W/2,403,{px:12.5,weight:850,color:P.spr,halo:false});
  }
  const wide={W:1120,H:440},narrow={W:360,H:695};
  Anim.add('econ-stack',{W:wide.W,H:wide.H,start:.4,narrowAt:600,draw(c,k,t,P,A){draw(c,k,t,P,A,wide)},narrow:{W:narrow.W,H:narrow.H,draw(c,k,t,P,A){draw(c,k,t,P,A,narrow)}}});
})();

function drawUseCaseIcon(c,id,x,y,w,h,P){
  rr(c,x,y,w,h,14,P.bg,P.line,1);
  if(id==='totes'){
    line(c,[x+20,y+h-42],[x+w-20,y+h-42],P.line2,8);
    for(let i=0;i<4;i++)rr(c,x+26+i*35,y+h-66,24,22,4,i%2?P.hybrid+'20':P.classic+'20',i%2?P.hybrid:P.classic,1);
    line(c,[x+w-56,y+42],[x+w-56,y+h-72],P.hybrid,5);
    line(c,[x+w-56,y+42],[x+w-30,y+67],P.hybrid,5);
    dot(c,x+w-30,y+67,7,P.e2e);
  }else if(id==='machine'){
    rr(c,x+32,y+55,w-64,h-98,8,P.classic+'12',P.classic,1.4);
    dot(c,x+w/2,y+h/2,31,P.bg,P.classic);
    dot(c,x+w/2,y+h/2,9,P.hybrid);
    rr(c,x+w-65,y+30,34,22,4,P.good+'15',P.good,1);
  }else if(id==='laundry'){
    for(let i=0;i<5;i++){
      c.save();c.translate(x+42+i*25,y+85+(i%2)*18);c.rotate((i-2)*.12);rr(c,-17,-11,34,22,6,i%2?P.hybrid+'18':P.classic+'18',i%2?P.hybrid:P.classic,1);c.restore();
    }
    rr(c,x+35,y+h-68,w-70,38,9,P.bg2,P.line,1);
  }else{
    line(c,[x+40,y+h-42],[x+w-42,y+44],P.classic,8);
    dot(c,x+40,y+h-42,14,P.bg,P.classic);
    dot(c,x+w-42,y+44,11,P.bg,P.classic);
    line(c,[x+w-55,y+57],[x+w-30,y+82],P.bad,5);
    line(c,[x+w-30,y+57],[x+w-55,y+82],P.bad,5);
  }
}

function drawWorkLane(c,x,y,w,labelText,color,useful,success,progress,P,help){
  rr(c,x,y,w,86,12,P.bg,P.line,1);
  label(c,labelText,x+14,y+18,{align:'left',size:10,weight:850,color});
  const cells=20,gap=4,cw=(w-28-(cells-1)*gap)/cells,active=Math.round(cells*useful*progress),ok=Math.round(active*success);
  for(let i=0;i<cells;i++){
    const xx=x+14+i*(cw+gap),fill=i>=active?P.bg2:i<ok?color+'25':P.bad+'18',stroke=i>=active?P.line:i<ok?color:P.bad;
    rr(c,xx,y+34,cw,20,4,fill,stroke,1);
  }
  label(c,`${Math.round(useful*100)}% полезного времени`,x+14,y+70,{align:'left',size:9,color:P.ink3});
  if(help!=null)label(c,`${Math.round(help*progress)} вмешательств`,x+w-14,y+70,{align:'right',size:9,weight:750,color:P.mot||P.bad});
}

function drawShift(cv,r,progress){
  const n=cv.clientWidth<560,W=n?360:760,H=n?540:410,c=fit(cv,W,H),P=colors(),p=progress==null?1:progress;
  c.fillStyle=P.bg2;c.fillRect(0,0,W,H);
  label(c,r.useCase.name,W/2,25,{size:n?12:14,weight:830,color:P.ink});
  if(n){
    drawUseCaseIcon(c,r.useCase.id,20,48,320,150,P);
    drawWorkLane(c,20,214,320,'РОБОТ',P.hybrid,r.input.utilization,r.input.success,p,P,r.interventions);
    drawWorkLane(c,20,312,320,'ЧЕЛОВЕК',P.classic,1,1,p,P,null);
    rr(c,20,426,320,88,12,P.bg,r.eligible?(r.pass?P.good:P.bad):P.bad,1.2);
    label(c,r.eligible?'обязательные ворота пройдены':'качество или безопасность не пройдены',W/2,450,{size:10.5,weight:800,color:r.eligible?P.good:P.bad});
    label(c,r.eligible?`${money(r.costTask)} робот · ${money(r.humanCostTask)} человек`:'экономика остановлена до исправления',W/2,480,{size:11,weight:820,color:r.eligible?(r.pass?P.good:P.bad):P.bad});
    return;
  }
  drawUseCaseIcon(c,r.useCase.id,22,58,188,274,P);
  drawWorkLane(c,230,61,508,'РОБОТ · купленное время месяца',P.hybrid,r.input.utilization,r.input.success,p,P,r.interventions);
  drawWorkLane(c,230,163,508,'ЧЕЛОВЕК · доступное время',P.classic,1,1,p,P,null);
  rr(c,230,276,508,68,12,P.bg,r.eligible?(r.pass?P.good:P.bad):P.bad,1.2);
  label(c,r.eligible?'КАЧЕСТВО И БЕЗОПАСНОСТЬ ПРОЙДЕНЫ':'ОБЯЗАТЕЛЬНЫЕ ВОРОТА НЕ ПРОЙДЕНЫ',248,296,{align:'left',size:9.5,weight:850,color:r.eligible?P.good:P.bad});
  label(c,r.eligible?`робот ${money(r.costTask)} · человек ${money(r.humanCostTask)} за задачу`:'финансовое сравнение пока не имеет смысла',248,323,{align:'left',size:11.5,weight:820,color:r.eligible?(r.pass?P.good:P.bad):P.bad});
  label(c,'зелёный — успешная работа · серый — простой · красный — незавершённая доля',W/2,381,{size:9,color:P.ink3});
}
function fillShift(r){$('#sTasks').textContent=Math.round(r.successes).toLocaleString('ru-RU');$('#sHelp').textContent=Math.round(r.interventions);$('#sRobot').textContent=money(r.costTask);$('#sHuman').textContent=money(r.humanCostTask)}
function initShift(){const S={id:'totes',last:null},cv=$('#shiftCv'),out=$('#shiftResult');function render(p){const r=S.last||L88.runCase(S.id);drawShift(cv,r,p);fillShift(r);$$('#shiftCtl button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===S.id)))}function set(id){S.id=id;S.last=null;render(1);setOut(out,'Процесс выбран. Сначала сделай ставку, затем запусти месяц.')}async function run(){S.last=L88.runCase(S.id);const steps=reduced()?1:12;for(let i=0;i<=steps;i++){render(i/steps);if(steps>1)await sleep(35)}const r=S.last;setOut(out,!r.eligible?'Качество или безопасность не прошли. Денежный результат не открывает ворота.':r.pass?`Успешная задача стоит ${money(r.costTask)} против ${money(r.humanCostTask)} у альтернативы.`:`При этих утилизации и помощи задача стоит ${money(r.costTask)} — выше альтернативы ${money(r.humanCostTask)}.`,r.eligible&&r.pass?'good':'bad');return r}$('#shiftCtl').onclick=e=>{const b=e.target.closest('button');if(b)set(b.dataset.v)};addEventListener('resize',()=>render(1),{passive:true});new MutationObserver(()=>render(1)).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});const api={reset(){set('totes')},state(){return S},set,run};const missions=[
  {short:'Контейнеры',title:'Проверь узкий поток с большой очередью',text:'Запусти контейнеры. Смотри одновременно на задачи и вмешательства.',controls:'all',onEnter(){set('totes')},bet:{q:'Узкий поток окажется дешевле альтернативы?',options:['Да','Нет'],answer:r=>r.pass?0:1},action:{label:'Проиграть месяц',run},criteria:[{label:'Процесс прошёл обязательные ворота',test:r=>r.eligible},{label:'Стоимость успешной задачи ниже альтернативы',test:r=>r.pass}],summary:r=>`${Math.round(r.successes)} успехов · ${money(r.costTask)} за задачу`,explain:()=> 'Высокий поток и редкие вмешательства распределили фиксированные расходы по большому числу результатов.'},
  {short:'Станок',title:'Сравни более редкий и медленный цикл',text:'Переключись на обслуживание станка и запусти тот же месячный договор.',controls:'all',onEnter(){set('machine')},action:{label:'Проиграть станок',run},criteria:[{label:'Качество и безопасность пройдены',test:r=>r.eligible},{label:'Названа фактическая цена задачи',test:r=>Number.isFinite(r.costTask)}],summary:r=>`${money(r.costTask)} против ${money(r.humanCostTask)}`,explain:r=> r.pass?'Даже медленный цикл может сходиться, если альтернативное время дорого и процесс загружен.':'Редкий поток оставил слишком мало задач для фиксированной стоимости.'},
  {short:'Бельё',title:'Увидь цену низкой утилизации',text:'Домашнее бельё разнообразно, а очередь задач короткая. Запусти и сравни знаменатель.',controls:'all',onEnter(){set('laundry')},action:{label:'Проиграть домашний месяц',run},criteria:[{label:'Увидеть стоимость выше альтернативы',test:r=>r.eligible&&!r.pass}],summary:r=>`${Math.round(r.successes)} успехов · ${Math.round(r.interventions)} вмешательств`,explain:()=> 'Низкая утилизация и частая помощь сделали задачу дорогой, хотя корпус мог быть дешевле промышленного.'},
  {short:'Ремонт',title:'Не пропусти экономику раньше качества',text:'Нестандартный ремонт имеет высокую ценность, но текущая система не прошла качество и безопасность.',controls:'all',onEnter(){set('repair')},action:{label:'Проверить ворота',run},criteria:[{label:'Процесс остановлен до экономического решения',test:r=>!r.eligible}],summary:r=>r.useCase.name,explain:()=> 'Экономия не компенсирует опасный или непроверяемый процесс. Сначала меняют систему или выбирают другую задачу.'},
  {short:'Свободно',title:'Сравни четыре процесса',text:'Переключай карточки и смотри, какой параметр меняет стоимость: поток, успех, помощь или обязательный критерий.',controls:'all',final:true}
];mountMissions('#shiftMis',missions,api,{controls:{case:'#shiftCtl'},scene:'#shiftCv'});render(1);return api}

function drawCalc(cv,r){
  const n=cv.clientWidth<560,W=n?360:760,H=n?560:410,c=fit(cv,W,H),P=colors();
  const parts=[['капитал',r.capital,P.hybrid],['сервис',r.input.service,P.classic],['энергия',r.input.energy,P.out],['вычисления',r.input.compute,P.e2e],['помощь',r.helpCost,P.bad]];
  c.fillStyle=P.bg2;c.fillRect(0,0,W,H);
  label(c,'Числитель и знаменатель меняются отдельно',W/2,25,{size:n?11.5:14,weight:830,color:P.ink});
  const costBox=n?{x:20,y:50,w:320,h:220}:{x:20,y:55,w:330,h:255};
  const taskBox=n?{x:20,y:300,w:320,h:170}:{x:410,y:55,w:330,h:255};
  rr(c,costBox.x,costBox.y,costBox.w,costBox.h,13,P.bg,P.line,1);
  label(c,'ПОЛНАЯ СТОИМОСТЬ МЕСЯЦА',costBox.x+16,costBox.y+22,{align:'left',size:9.5,weight:850,color:P.ink3});
  const max=Math.max(...parts.map(x=>x[1]),1);
  parts.forEach((z,i)=>{
    const yy=costBox.y+51+i*(n?31:37),bw=(costBox.w-126)*z[1]/max;
    label(c,z[0],costBox.x+14,yy,{align:'left',size:9.5,weight:720,color:P.ink2});
    rr(c,costBox.x+82,yy-7,bw,14,4,z[2]+'24',z[2],1);
    label(c,money(z[1]),costBox.x+costBox.w-12,yy,{align:'right',size:9.2,weight:730,color:z[2]});
  });
  rr(c,taskBox.x,taskBox.y,taskBox.w,taskBox.h,13,P.bg,P.line,1);
  label(c,'УСПЕШНЫЕ ЗАДАЧИ',taskBox.x+16,taskBox.y+22,{align:'left',size:9.5,weight:850,color:P.ink3});
  const total=40,ok=Math.round(total*r.input.utilization*r.input.success);
  for(let i=0;i<total;i++){
    const cols=n?10:10,xx=taskBox.x+22+(i%cols)*((taskBox.w-44)/(cols-1)),yy=taskBox.y+54+Math.floor(i/cols)*(n?24:34);
    dot(c,xx,yy,5,i<ok?P.good:P.bg2,i<ok?P.good:P.line);
  }
  label(c,`${Math.round(r.successes).toLocaleString('ru-RU')} успехов`,taskBox.x+16,taskBox.y+taskBox.h-24,{align:'left',size:11,weight:820,color:P.good});
  label(c,`${Math.round(r.input.utilization*100)}% времени · ${Math.round(r.input.success*100)}% успеха`,taskBox.x+taskBox.w-14,taskBox.y+taskBox.h-24,{align:'right',size:9,color:P.ink3});
  if(!n){label(c,'÷',380,181,{size:27,weight:850,color:P.ink2})}
  const gy=n?505:350,left=28,right=W-28,ratio=Math.min(1.6,r.costTask/r.humanCostTask),robotX=left+(right-left)*ratio/1.6,humanX=left+(right-left)/1.6;
  line(c,[left,gy],[right,gy],P.line2,5);
  line(c,[humanX,gy-25],[humanX,gy+25],P.classic,2,[4,3]);
  dot(c,robotX,gy,9,r.pass?P.good:P.bad,P.bg);
  label(c,`порог человека ${money(r.humanCostTask)}`,humanX,gy+38,{size:9.5,color:P.classic});
  const robotAtRight=robotX>right-82;
  label(c,`робот ${money(r.costTask)}`,robotAtRight?right-3:robotX,gy-27,{align:robotAtRight?'right':'center',size:10.5,weight:820,color:r.pass?P.good:P.bad});
}
function initCalc(){const base={utilization:.5,success:.85,helpEvery:20,cycleSec:120},S={...base,last:null},cv=$('#calcCv'),out=$('#calcResult');function result(){S.last=L88.economics(S);return S.last}function render(){const r=result();drawCalc(cv,r);$('#cTotal').textContent=money(r.total);$('#cTasks').textContent=Math.round(r.successes).toLocaleString('ru-RU');$('#cRobot').textContent=money(r.costTask);$('#cDelta').textContent=(r.costTask<=r.humanCostTask?'−':'+')+money(Math.abs(r.costTask-r.humanCostTask));$('#oUtil').textContent=Math.round(S.utilization*100)+'%';$('#oSuccess').textContent=Math.round(S.success*100)+'%';$('#oHelp').textContent=S.helpEvery;$('#oCycle').textContent=S.cycleSec+' с';$$('#calcCtl input').forEach(x=>x.value=x.dataset.k==='utilization'?S.utilization*100:x.dataset.k==='success'?S.success*100:S[x.dataset.k])}function set(v){Object.assign(S,v);render();setOut(out,'Параметры изменены. Проверь условие миссии.')}function run(){const r=result();setOut(out,r.pass?`Порог пройден: ${money(r.costTask)} за успех против ${money(r.humanCostTask)}.`:`Пока ${money(r.costTask)} за успех. Сначала найди главный ограничитель знаменателя или помощи.`,r.pass?'good':'bad');return r}$('#calcCtl').oninput=e=>{const x=e.target.closest('input');if(!x)return;const v=+x.value;set({[x.dataset.k]:x.dataset.k==='utilization'||x.dataset.k==='success'?v/100:v})};addEventListener('resize',render,{passive:true});new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});const api={reset(){Object.assign(S,base);render()},state(){return S},set,run};const missions=[
  {short:'Знаменатель',title:'Сделай процесс достаточно загруженным',text:'Не меняя успех и помощь, подними утилизацию хотя бы до 75%.',controls:'all',onEnter(){set(base)},action:{label:'Посчитать задачу',run},criteria:[{label:'Утилизация не ниже 75%',test:r=>r.input.utilization>=.75},{label:'Число успехов выросло',test:r=>r.successes>5700}],summary:r=>`${Math.round(r.input.utilization*100)}% · ${Math.round(r.successes)} успехов`,explain:()=> 'Фиксированная стоимость распределилась по большему числу задач. Но частая помощь всё ещё может удерживать цену высокой.'},
  {short:'Помощь',title:'Уменьши труд оператора',text:'Сохрани утилизацию и добейся не меньше 80 задач между вмешательствами.',controls:'all',onEnter(){set({utilization:.78,success:.85,helpEvery:20,cycleSec:120})},action:{label:'Пересчитать помощь',run},criteria:[{label:'Не меньше 80 задач между вмешательствами',test:r=>r.input.helpEvery>=80},{label:'Стоимость помощи снизилась',test:r=>r.helpCost<700}],summary:r=>`${Math.round(r.interventions)} вмешательств · ${money(r.helpCost)}`,explain:()=> 'Редкая помощь уменьшила числитель. Автономность имеет экономический смысл через минуты людей, а не через красивый процент.'},
  {short:'Порог',title:'Собери стоимость ниже альтернативы',text:'Теперь можно менять все четыре параметра. Добейся меньшей стоимости задачи без требования идеальных 99%.',controls:'all',onEnter(){set({utilization:.65,success:.82,helpEvery:35,cycleSec:150})},action:{label:'Проверить порог',run},criteria:[{label:'Стоимость успешной задачи ниже альтернативы',test:r=>r.pass},{label:'Успех не обязан быть 99%',test:r=>r.input.success<.99}],summary:r=>`${money(r.costTask)} против ${money(r.humanCostTask)}`,explain:()=> 'Экономика сошлась сочетанием потока, скорости, успеха и редкой помощи. Ни один показатель не был достаточен отдельно.'},
  {short:'Свободно',title:'Сломай бизнес-кейс одним рычагом',text:'После успешной конфигурации опусти по одному параметру. Найди, где стоимость снова пересечёт альтернативу.',controls:'all',final:true}
];mountMissions('#calcMis',missions,api,{controls:{sliders:'#calcCtl'},scene:'#calcCv'});render();return api}

function drawPortfolio(cv,r,selected){
  const n=cv.clientWidth<560,W=n?360:760,H=n?540:410,c=fit(cv,W,H),P=colors(),ids=['totes','machine','laundry','repair'];
  c.fillStyle=P.bg2;c.fillRect(0,0,W,H);
  label(c,'Процесс проходит ворота слева направо',W/2,24,{size:n?11.5:14,weight:830,color:P.ink});
  const names=['качество','безопасность','экономика','бюджет'];
  if(!n)names.forEach((z,i)=>label(c,z,286+i*105,58,{size:9.5,weight:800,color:P.ink3}));
  ids.forEach((id,i)=>{
    const row=r.rows.find(x=>x.useCase.id===id)||L88.runCase(id),on=selected.includes(id),chosen=r.chosen.includes(id);
    const gates=[row.useCase.quality,row.useCase.safety,row.monthlyValue>0,chosen];
    if(n){
      const x=20,y=52+i*103,w=320;
      rr(c,x,y,w,88,12,on?P.bg:P.bg2,on?P.e2e:P.line,1.2);
      label(c,row.useCase.name,x+14,y+18,{align:'left',size:10.5,weight:820,color:on?P.ink:P.ink3});
      names.forEach((z,j)=>{
        const gx=x+45+j*77,available=on&&(j===0||gates.slice(0,j).every(Boolean)),yes=available&&gates[j];
        if(j<3)line(c,[gx+9,y+51],[gx+68,y+51],available?(yes?P.good:P.bad):P.line,1.5);
        dot(c,gx,y+51,8,yes?P.good+'22':available?P.bad+'18':P.bg2,yes?P.good:available?P.bad:P.line);
        if(available)label(c,yes?'✓':'×',gx,y+52,{size:10,weight:850,color:yes?P.good:P.bad});
        label(c,z,gx,y+72,{size:7.5,color:P.ink3});
      });
      return;
    }
    const y=83+i*69;
    rr(c,18,y-24,724,55,11,on?P.bg:P.bg2,on?P.e2e:P.line,1.1);
    label(c,row.useCase.name,34,y,{align:'left',size:11,weight:820,color:on?P.ink:P.ink3});
    const gx=[286,391,496,601];
    gates.forEach((yes,j)=>{
      const available=on&&(j===0||gates.slice(0,j).every(Boolean));
      if(j<3)line(c,[gx[j]+10,y],[gx[j+1]-10,y],available?(yes?P.good:P.bad):P.line,2);
      dot(c,gx[j],y,10,available?(yes?P.good+'22':P.bad+'18'):P.bg2,available?(yes?P.good:P.bad):P.line);
      if(available)label(c,yes?'✓':'×',gx[j],y+1,{size:11,weight:850,color:yes?P.good:P.bad});
    });
    label(c,!on?'не выбран':chosen?'в портфеле':!row.useCase.quality||!row.useCase.safety?'остановлен обязательным критерием':row.monthlyValue<=0?'нет положительного потока':'не прошёл бюджет',724,y,{align:'right',size:9.5,weight:730,color:chosen?P.good:on?P.bad:P.ink3});
  });
  rr(c,n?20:160,n?476:363,n?320:440,44,11,r.pass?P.good+'12':P.bg,r.pass?P.good:P.line,1.2);
  label(c,`остаток ${money(r.left)} · поток ${r.total>=0?'+':''}${money(r.total)}/мес`,W/2,n?498:385,{size:n?10:11.5,weight:820,color:r.pass?P.good:P.ink2});
}
function initPortfolio(){const S={selected:['totes'],last:null},cv=$('#portfolioCv'),out=$('#portfolioResult');function calc(){S.last=L88.portfolio(S.selected,480000);return S.last}function render(){drawPortfolio(cv,calc(),S.selected);$$('#portfolioCtl button').forEach(b=>b.setAttribute('aria-pressed',String(S.selected.includes(b.dataset.v))))}function toggle(id){S.selected=S.selected.includes(id)?S.selected.filter(x=>x!==id):S.selected.concat(id);render();setOut(out,'Портфель изменён. Запусти ворота.')}function run(){const r=calc();setOut(out,r.pass?`Выбран ограниченный поток с положительной моделью; ремонт остановлен обязательными воротами.`:`Проверь порядок: контейнеры должны пройти, ремонт — остановиться до бюджета.`,r.pass?'good':'bad');return r}$('#portfolioCtl').onclick=e=>{const b=e.target.closest('button');if(b)toggle(b.dataset.v)};addEventListener('resize',render,{passive:true});new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});const api={reset(){S.selected=['totes'];render()},state(){return S},toggle,run};const missions=[
  {short:'Один процесс',title:'Начни с узкой очереди',text:'Оставь только контейнеры и пропусти карточку через четыре ворот.',controls:'all',onEnter(){S.selected=['totes'];render()},action:{label:'Запустить ворота',run},criteria:[{label:'Контейнеры прошли все ворота',test:r=>r.chosen.includes('totes')}],summary:r=>r.chosen.join(', '),explain:()=> 'Первый процесс не самый эффектный, зато поток, успех и безопасная остановка делают результат измеримым.'},
  {short:'Ловушка',title:'Добавь дорогой нестандартный ремонт',text:'Выбери ремонт вместе с контейнерами. Экономический оптимизатор должен остановить его раньше бюджета.',controls:'all',onEnter(){S.selected=['totes','repair'];render()},action:{label:'Проверить обязательные ворота',run},criteria:[{label:'Ремонт не попал в выбранный портфель',test:r=>!r.chosen.includes('repair')},{label:'Контейнеры остались',test:r=>r.chosen.includes('totes')}],summary:r=>`выбрано: ${r.chosen.join(', ')}`,explain:()=> 'Высокая ценность ремонта не отменяет провал качества и безопасности. Деньги считаются после обязательных ворот.'},
  {short:'Бюджет',title:'Сравни ещё два процесса',text:'Добавь станок и бельё. Движок распределит ограниченный бюджет только по положительным вариантам.',controls:'all',onEnter(){S.selected=['totes','machine','laundry','repair'];render()},action:{label:'Собрать портфель',run},criteria:[{label:'Портфель не превышает бюджет',test:r=>r.left>=0},{label:'В нём нет процесса с провалом обязательных ворот',test:r=>!r.chosen.includes('repair')}],summary:r=>`${r.chosen.length} процесса · остаток ${money(r.left)}`,explain:()=> 'Бюджет не заставляет покупать всё, что технически возможно. Он следует после качества, безопасности и положительного потока.'},
  {short:'Свободно',title:'Собери альтернативный портфель',text:'Переключай процессы и читай причину отказа у каждой карточки.',controls:'all',final:true}
];mountMissions('#portfolioMis',missions,api,{controls:{cards:'#portfolioCtl'},scene:'#portfolioCv'});render();return api}

function initQuiz(){const Q=[
  {q:'Почему цена корпуса не является стоимостью робота в процессе?',o:['Нужны внедрение, сервис, вычисления, энергия и труд вмешательств','Корпус всегда бесплатен','Цена не бывает публичной'],a:0,e:'TCO включает все ресурсы, которые нужны для результата за период.'},
  {q:'Что входит в знаменатель стоимости задачи?',o:['Все попытки','Только задачи, завершённые по договору качества','Только часы работы'],a:1,e:'Неудачная попытка расходует деньги, но не создаёт полезный результат.'},
  {q:'Утилизация 40% при успехе 99%. Что это означает?',o:['Робот почти идеален экономически','Большая часть купленного времени не стала полезной работой','Робот небезопасен'],a:1,e:'Высокий успех не компенсирует пустое или недоступное время.'},
  {q:'Оператор помогает раз в час. Какой ещё параметр нужен?',o:['Цвет интерфейса','Длительность вмешательства','Число нейронов'],a:1,e:'Четыре минуты и сорок минут имеют одинаковую частоту, но разную стоимость.'},
  {q:'Почему нестандартный ремонт остановлен до расчёта денег?',o:['Он слишком медленный','Он не прошёл качество и безопасность','У него нет зарплаты'],a:1,e:'Обязательные критерии нельзя компенсировать экономией.'},
  {q:'BMW сообщает 90 000 деталей и 1 250 часов. Можно ли посчитать ROI?',o:['Да, этого достаточно','Нет: нет полной стоимости и честной альтернативы','Да, если поделить детали на часы'],a:1,e:'Можно посчитать наблюдаемую пропускную способность, но не окупаемость.'},
  {q:'Когда гуманоидная форма экономически полезна?',o:['Всегда','Когда среда под человека и гибкость дешевле перестройки, что подтверждено расчётом','Только дома'],a:1,e:'Форма — гипотеза о стоимости адаптации, а не готовый вывод.'},
  {q:'Зачем считать плохой сценарий?',o:['Чтобы занизить проект','Чтобы решение не зависело от идеальной автономности и лучшего месяца','Чтобы не проводить пилот'],a:1,e:'Плохой сценарий проверяет запас устойчивости и порог остановки.'}
];const box=$('#quizBox');let n=0,ok=0;Q.forEach((q,i)=>{const card=h('div',{class:'card q-card'},h('h4',null,h('span',{class:'qn'},`${i+1}.`),h('span',null,q.q))),opts=h('div',{class:'q-opts'}),exp=h('div',{class:'q-exp',hidden:true});q.o.forEach((o,j)=>{const b=h('button',{type:'button',class:'q-opt'},o);b.onclick=()=>{if(card.dataset.done)return;card.dataset.done='1';const yes=j===q.a;b.classList.add(yes?'correct':'incorrect');if(!yes)$$('.q-opt',opts)[q.a].classList.add('correct');exp.innerHTML=`<strong>${yes?'Верно.':'Не совсем.'}</strong> ${q.e}`;exp.hidden=false;n++;if(yes)ok++;$('#quizScore').textContent=n===Q.length?`Итог: ${ok} из ${Q.length}. ${ok>=6?'Часть 8 можно собирать в итоговую проверку.':'Вернись к разделам с ошибками.'}`:`Отвечено ${n} из ${Q.length}`};opts.append(b)});card.append(opts,exp);box.append(card)})}
(function boot(){const start=()=>{initTheme();initNav();const mis={shift:initShift(),calc:initCalc(),portfolio:initPortfolio()};initQuiz();const n=['shiftMis','calcMis','portfolioMis'].reduce((s,id)=>s+Math.max(0,$$('#'+id+' .g-steps li').length-1),0);$('#heroMis').textContent=`${n} миссий с целью`;window.__l88={mis,L88};window.__lessonReady=true};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start()})();
