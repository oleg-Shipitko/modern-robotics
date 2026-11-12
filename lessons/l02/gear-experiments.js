/* Rope, geared arm and landing leg: interactive experiments for laboratory 1. */
(function(){'use strict';
const $=id=>document.getElementById(id),cv=$('ropeCv');if(!cv)return;
const TAU=Math.PI*2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),fmt=(v,n=1)=>v.toLocaleString('ru-RU',{minimumFractionDigits:n,maximumFractionDigits:n});
const st={mode:0,m:1,F:8,r:.032,N:1,h:0,v:0,angle:0,active:true,elapsed:0,force:8};let W=640,H=440,last=0,visible=true,lastUI=0,lastMessage='',clock=0;
const MAXH=.4,TORQUE=.16,OMEGA=TAU*2;
function forces(s){const N=s.mode===2?4:1,weight=s.m*10,capacity=s.mode===0?s.F:TORQUE*N/s.r,target=OMEGA*s.r/N;let force=0;
 if(s.mode===0)force=s.F;else if(s.active)force=s.h>=MAXH-1e-7&&s.v>=0?Math.min(weight,capacity):clamp(weight+12*s.m*(target-s.v),0,capacity);
 const support=s.h<=1e-7&&s.v<=0?Math.max(0,weight-force):0,stop=s.h>=MAXH-1e-7&&s.v>=0?Math.max(0,force-weight):0,net=force+support-weight-stop;
 return{weight,capacity,force,support,stop,net,acceleration:net/s.m};}
function physical(s,dt){const f=forces(s);let v=s.v+f.acceleration*dt,h=s.h+v*dt;
 if(h<=0){h=0;v=Math.max(0,v);}if(h>=MAXH){h=MAXH;v=Math.min(0,v);}
 const angle=s.mode===0?0:(s.angle||0)+(h-s.h)/s.r;
 return{h,v,angle,...forces({...s,h,v}),elapsed:s.elapsed+dt};}
function reset(){st.h=0;st.v=0;st.angle=0;st.elapsed=0;st.force=st.mode===0?st.F:0;st.active=st.mode===0;lastMessage='';sync();draw();}
function setMode(mode){st.mode=clamp(Math.round(mode),0,2);st.N=st.mode===2?4:1;st.m=1;st.r=.032;st.F=8;$('ropeMass').value=1;$('ropeRadius').value=3.2;$('ropeForce').value=8;reset();}
function start(){if(matchMedia('(max-width:900px)').matches)window.scrollTo({top:cv.getBoundingClientRect().top+scrollY-80,behavior:'instant'});st.active=true;sync();}
function toggle(){if(st.mode===0)return;st.active=!st.active;if(matchMedia('(max-width:900px)').matches)window.scrollTo({top:cv.getBoundingClientRect().top+scrollY-80,behavior:'instant'});sync();}
function derived(){return{...forces(st),required:st.m*10*st.r,energy:st.m*10*st.h,turns:st.N*st.angle/TAU,perTurn:TAU*st.r/st.N,motorWork:TORQUE*TAU,loadWork:10*st.m*TAU*st.r/st.N};}
function movement(d){if(st.h<=1e-7&&Math.abs(st.v)<.001&&d.net<=.005)return'На опоре';if(st.h>=MAXH-1e-7&&Math.abs(st.v)<.001&&d.net>=-.005)return'У верхнего упора';if(Math.abs(st.v)<.001)return Math.abs(d.net)<.05?'Неподвижен':d.net>0?'Начинает подъём':'Начинает падать';if(st.v>0)return Math.abs(d.net)<.05?'Равномерно вверх':d.net>0?'Разгоняется вверх':'Подъём замедляется';return Math.abs(d.net)<.05?'Равномерно вниз':d.net<0?'Разгоняется вниз':'Спуск замедляется';}
const guides=[
 ['Сила · Прямой подъём','Сможешь поднять груз?','Груз массой 1 кг тянет вниз примерно с силой 10 ньютонов (Н). Увеличь тягу с 8 до 12 Н. Во время подъёма уменьши её ниже 10 Н: груз сначала замедлится, затем опустится.'],
 ['Момент · Вращение катушки','Мотор тянет ту же верёвку','Мотор пытается повернуть катушку, груз мешает. Вращающее усилие называют крутящим моментом. У груза он равен силе × радиус катушки — расстояние от оси до края. Измеряется в Н·м. Мотор даёт до 0,16 Н·м. Включи его, затем уменьши радиус: поднимется ли груз?'],
 ['Редуктор · Больше оборотов, меньше подъём','Тот же мотор — другой результат','Маленькая шестерёнка мотора вращает большую. Мотор делает 4 оборота, катушка — 1: это передача 4 : 1. За оборот мотора груз поднимается меньше, и мотор справляется с большей нагрузкой.']
];
function sync(){const d=derived(),motor=st.mode>0;document.querySelectorAll('[data-rope-mode]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.ropeMode===st.mode)));
 $('ropeForceRow').hidden=motor;$('ropeRadiusRow').hidden=!motor;$('ropeActions').hidden=!motor;$('ropeEnergyVisual').hidden=!motor;for(const id of ['ropeMomentLabel','ropeMoment','ropeTurnsLabel','ropeTurns'])$(id).hidden=!motor;
 $('ropeMassOut').textContent=fmt(st.m)+' кг';$('ropeForceOut').textContent=fmt(st.F,0)+' Н';$('ropeRadiusOut').textContent=fmt(st.r*100)+' см';
 for(const id of ['ropeMass','ropeForce','ropeRadius']){const el=$(id);el.style.setProperty('--fill',((+el.value-+el.min)/(+el.max-+el.min)*100)+'%');}
 [$('ropeKicker'),$('ropeTitle'),$('ropeText')].forEach((el,i)=>el.textContent=guides[st.mode][i]);
 if(st.mode===2)$('ropeText').textContent='Четыре оборота мотора дают один оборот катушки: передача 4 : 1. За свой оборот мотор поднимает груз лишь на '+fmt(d.perTurn*100,1)+' см вместо '+fmt(d.perTurn*400,1)+' см. Нужна меньшая энергия за оборот — сравни полосы под сценой. Включи мотор, затем выключи: груз провернёт передачу обратно.';
 $('ropeActual').textContent=fmt(d.force)+' Н';$('ropeWeight').textContent=fmt(d.weight,0)+' Н';$('ropeSupport').textContent=fmt(d.support)+' Н';$('ropeStop').textContent=fmt(d.stop)+' Н';for(const id of ['ropeSupportLabel','ropeSupport'])$(id).hidden=d.support<.005;for(const id of ['ropeStopLabel','ropeStop'])$(id).hidden=d.stop<.005;
 $('ropeNet').textContent=Math.abs(d.net)<.05?'≈ 0 Н':fmt(Math.abs(d.net))+' Н '+(d.net>0?'↑':'↓');$('ropeMotion').textContent=movement(d);$('ropeCapacityLabel').hidden=!motor;$('ropeCapacity').hidden=!motor;$('ropeCapacity').textContent='до '+fmt(d.capacity)+' Н';$('ropeMoment').textContent=fmt(d.required,2)+' Н·м';$('ropeHeight').textContent=fmt(st.h*100,0)+' см';$('ropeEnergy').textContent=fmt(d.energy,2)+' Дж';$('ropeTurns').textContent=fmt(d.turns,2)+' об.';
 $('ropeLift').textContent=st.active?'Выключить мотор':'Включить мотор';$('ropeLift').disabled=false;$('ropeLift').setAttribute('aria-pressed',String(st.active));
 const scale=Math.max(d.motorWork,d.loadWork*st.N)*1.05;$('ropeMotorWork').textContent='до '+fmt(d.motorWork,2)+' Дж';$('ropeLoadWork').textContent=fmt(d.loadWork,2)+' Дж';$('ropeMotorBar').style.width=(100*d.motorWork/scale)+'%';$('ropeLoadBar').style.width=(100*d.loadWork/scale)+'%';$('ropeNeedLabel').textContent='Грузу нужно · '+(st.N===4?'передача 4 : 1':'напрямую');
 $('ropeEnergyConclusion').textContent=d.loadWork>d.motorWork+.001?'Нужно больше, чем мотор может передать за такой поворот. С пола груз не поднимется.':Math.abs(d.loadWork-d.motorWork)<.001?'Возможности равны нагрузке: для начала подъёма нужен запас.':'Энергии на этот небольшой подъём хватает. Для той же высоты мотору потребуется '+(st.N===4?'вчетверо больше оборотов.':'меньше оборотов, чем с передачей.');
 $('ropeRead').textContent=motor?'Силы на груз вынесены отдельно: тяга сейчас и предел мотора — разные величины. Пунктир — расчётный подъём за оборот.':'Силы на груз показаны отдельно. Их сумма меняет скорость: при нуле уже движущийся груз не останавливается. Движение ×0,25.';
 $('ropeModelNote').textContent=motor?'Мотор: до 0,16 Н·м, цель — 2 оборота/с. Каждый этап начинается с 1 кг и радиуса 3,2 см. Дж — единица энергии.':'Дж — джоуль, единица энергии. При подъёме 1 кг на 10 см груз получает примерно 1 Дж. Движение замедлено в четыре раза.';
 let message;if(st.h>=MAXH-.00001&&st.v>=0)message=st.mode===0?'Груз у верхнего ограничителя. Уменьши тягу ниже '+fmt(d.weight,0)+' Н — он опустится.':'Груз наверху. Выключи мотор: верёвка размотается, вращая катушку и мотор обратно.';
 else if(!st.active&&motor)message=st.h>.001?'Мотор выключен. Груз опускается и сам проворачивает катушку, передачу и мотор.':'Мотор выключен. Включи его и сравни необходимую энергию с доступной на полосах под сценой.';
 else if(d.support>.005)message='Тяга '+fmt(d.force)+' Н и опора '+fmt(d.support)+' Н вместе уравновешивают вес '+fmt(d.weight,0)+' Н. Поэтому груз стоит на полу, а не падает сквозь него.';
 else if(Math.abs(d.net)<.05)message=Math.abs(st.v)>.001?'Тяга и сила тяжести почти равны. Груз уже движется и продолжает '+(st.v>0?'подъём':'спуск')+' с почти постоянной скоростью. Для движения не нужен постоянный разгон.':'Силы равны: неподвижный груз остаётся неподвижным. Для начала подъёма нужен запас тяги.';
 else if(d.net>0)message=st.v<-.001?'Сумма сил направлена вверх: она сначала замедляет падение, затем начнёт поднимать груз.':'Тяга больше силы тяжести на '+fmt(d.net)+' Н: груз разгоняется вверх.'+(motor?' Когда мотор выйдет на заданную скорость, тяга уменьшится до веса груза.':'');
 else message=st.v>.001?'Сумма сил направлена вниз: груз ещё движется вверх, но замедляется. Затем начнёт опускаться.':'Тяга меньше силы тяжести на '+fmt(-d.net)+' Н: груз ускоряется вниз.';
 if(message!==lastMessage){$('ropeExplanation').textContent=message;lastMessage=message;}
}
function palette(){const style=getComputedStyle(document.documentElement),get=(key,f)=>style.getPropertyValue(key).trim()||f;return{ink:get('--ink','#171717'),ink2:get('--ink-2','#555'),muted:get('--ink-3','#888'),line:get('--line','#ddd'),grid:get('--grid','#e8e7e3'),bg:get('--surface','#fff'),soft:get('--surface-2','#f5f4f0'),blue:get('--classic','#287bd4'),blueS:get('--classic-soft','#eaf2fc'),orange:get('--e2e','#e47837'),orangeS:get('--e2e-soft','#fff0e6'),purple:get('--hybrid','#7b62b0'),purpleS:get('--hybrid-soft','#f0eafa')};}
function line(c,pts,color,w=2,dash=[]){c.beginPath();c.moveTo(...pts[0]);pts.slice(1).forEach(p=>c.lineTo(...p));c.strokeStyle=color;c.lineWidth=w;c.lineCap='round';c.lineJoin='round';c.setLineDash(dash);c.stroke();c.setLineDash([]);}
function round(c,x,y,w,h,r,fill,stroke){c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=fill;c.fill();if(stroke){c.lineWidth=1.5;c.strokeStyle=stroke;c.stroke();}}
function circle(c,x,y,r,fill,stroke){c.beginPath();c.arc(x,y,r,0,TAU);c.fillStyle=fill;c.fill();if(stroke){c.lineWidth=1.8;c.strokeStyle=stroke;c.stroke();}}
function arrow(c,x,y,dy,color){line(c,[[x,y],[x,y+dy]],color,2);if(Math.abs(dy)>1){const dir=Math.sign(dy),head=Math.min(6,Math.abs(dy)*.5);line(c,[[x-head*.7,y+dy-dir*head],[x,y+dy],[x+head*.7,y+dy-dir*head]],color,2);}}
function gear(c,x,y,r,z,angle,fill,stroke,P){c.save();c.translate(x,y);c.rotate(angle);c.beginPath();for(let i=0;i<z*4;i++){const a=i*TAU/(z*4),rr=r+((i%4===1||i%4===2)?1.9:-1.9);i?c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr):c.moveTo(Math.cos(a)*rr,Math.sin(a)*rr);}c.closePath();c.fillStyle=fill;c.fill();c.strokeStyle=stroke;c.lineWidth=1.4;c.stroke();for(let i=0;i<3;i++){let a=i*TAU/3;line(c,[[Math.cos(a)*r*.25,Math.sin(a)*r*.25],[Math.cos(a)*r*.75,Math.sin(a)*r*.75]],stroke,2);}circle(c,0,0,3,P.bg,stroke);circle(c,r*.78,0,3,stroke);c.restore();}
function draw(){const box=cv.getBoundingClientRect();W=Math.max(300,Math.round(box.width||640));H=W<440?440:440;const dpr=Math.min(2,devicePixelRatio||1);if(cv.width!==W*dpr||cv.height!==H*dpr){cv.width=W*dpr;cv.height=H*dpr;}cv.style.aspectRatio=W+'/'+H;
 const c=cv.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);const P=palette(),small=W<440; c.fillStyle=P.bg;c.fillRect(0,0,W,H);c.globalAlpha=.45;for(let x=20;x<W;x+=24)for(let y=20;y<H;y+=24){c.fillStyle=P.grid;c.fillRect(x,y,1,1);}c.globalAlpha=1;
 const label=(text,x,y,color=P.ink2,align='center',size=12,bold=false)=>{c.font=(bold?'600 ':'')+size+'px Inter,system-ui,sans-serif';c.textAlign=align;c.textBaseline='middle';c.lineJoin='round';c.lineWidth=5;c.strokeStyle=P.bg;c.strokeText(text,x,y);c.fillStyle=color;c.fillText(text,x,y);};
 const ground=H-48,scale=430,loadY=ground-22-st.h*scale,drumX=small?W*.70:W*.73,drumY=110,drumR=18+st.r*380,ropeX=st.mode===0?W*.72:drumX+drumR,d=derived();
 line(c,[[22,ground],[W-22,ground]],P.ink2,1.5);for(let x=22;x<W-27;x+=10)line(c,[[x,ground+1],[x-5,ground+7]],P.line,1);
 // Height scale stays beside the moving weight; energy is encoded by filled height.
 const scaleX=W-24;
 line(c,[[scaleX,ground-22],[scaleX,ground-22-MAXH*scale]],P.line,1);
 for(let i=0;i<=4;i++){const y=ground-22-i*.1*scale;line(c,[[scaleX-4,y],[scaleX+4,y]],P.line,1);if(st.mode===0||!small)label(i*10+'',scaleX-9,y,P.muted,'right',10);}
 line(c,[[scaleX,ground-22],[scaleX,loadY]],P.blue,3);label('40 см',scaleX,ground-22-MAXH*scale-16,P.muted,'center',10);
 if(st.mode>0){const ghostY=ground-22-d.perTurn*scale,gx=ropeX-(small?40:82);
   line(c,[[gx,ground-22],[gx,ghostY],[ropeX+24,ghostY]],P.muted,1.2,[4,4]);line(c,[[gx-5,ground-22],[gx+5,ground-22]],P.muted,1);
   label(fmt(d.perTurn*100,1)+' см / оборот',small?W-12:gx-8,small?210:ghostY-9,P.muted,'right',10.5);
 }
 if(st.mode===0){
   const hy=210-st.h*scale;line(c,[[ropeX,hy+20],[ropeX,loadY-25]],P.blue,3);round(c,ropeX-35,hy-10,70,28,9,P.soft,P.ink2);line(c,[[ropeX-19,hy-8],[ropeX-19,hy+6]],P.ink2,1.2);line(c,[[ropeX-9,hy-8],[ropeX-9,hy+6]],P.ink2,1.2);line(c,[[ropeX+1,hy-8],[ropeX+1,hy+6]],P.ink2,1.2);line(c,[[ropeX+11,hy-8],[ropeX+11,hy+6]],P.ink2,1.2);label('Тянем за верёвку',ropeX,17,P.ink, 'center',13,true);
 }else{
   const mx=small?36:64,my=drumY,mr=small?20:28,angle=st.angle,motorAngle=st.mode===2?st.N*angle:-angle;
   round(c,mx-mr-7,my-mr-9,mr*2+14,mr*2+18,8,P.soft,P.ink2);for(let i=0;i<6;i++){let a=i*TAU/6;c.save();c.translate(mx,my);c.rotate(a);round(c,mr-8,-4,8,8,2,P.orangeS,P.orange);c.restore();}circle(c,mx,my,mr-10,P.orangeS,P.orange);line(c,[[mx,my],[mx+Math.cos(motorAngle)*(mr-11),my+Math.sin(motorAngle)*(mr-11)]],P.orange,3);label('Мотор',mx,55,P.orange,'center',12,true);
   if(st.active){const dir=st.mode===2?1:-1,a0=dir>0?-2.5:2.5,a1=a0+dir*1.5,R=mr+14;c.save();c.globalAlpha=.65+.25*Math.sin(clock*5);c.beginPath();c.arc(mx,my,R,a0,a1,dir<0);c.strokeStyle=P.orange;c.lineWidth=2.3;c.stroke();const ax=mx+R*Math.cos(a1),ay=my+R*Math.sin(a1),tx=-Math.sin(a1)*dir,ty=Math.cos(a1)*dir;line(c,[[ax-tx*7-ty*4,ay-ty*7+tx*4],[ax,ay],[ax-tx*7+ty*4,ay-ty*7-tx*4]],P.orange,2);c.restore();
     if(st.h<.001&&Math.abs(st.v)<.001)label('пытается повернуть',14,210,P.orange,'left',11,true);
     else if(st.h>=MAXH-.001)label('удерживает груз',14,210,P.orange,'left',11);
   }
   if(st.mode===2){const sr=small?8:13,gr=sr*4,sx=small?90:165,gx=sx+sr+gr;round(c,sx-sr-6,my-gr-7,gr*2+sr*2+12,gr*2+14,9,P.bg,P.line);line(c,[[mx+mr+7,my],[sx,my]],P.ink2,3);gear(c,sx,my,sr,12,motorAngle,P.orangeS,P.orange,P);gear(c,gx,my,gr,48,-angle+Math.PI/48,P.purpleS,P.purple,P);line(c,[[gx,my],[drumX,my]],P.ink2,3);label('4 : 1',(sx+gx)/2,small?33:30,P.purple,'center',13,true);label('Редуктор',(sx+gx)/2,small?173:184,P.purple,'center',11);}
   else{line(c,[[mx+mr+7,my],[drumX,my]],P.ink2,4);label('Прямое соединение',(mx+drumX)/2,small?164:174,P.muted,'center',11);}
   circle(c,drumX,drumY,drumR,P.soft,P.ink2);circle(c,drumX,drumY,drumR-5,P.bg,P.line);const a=-angle;line(c,[[drumX,drumY],[drumX+Math.cos(a)*drumR*.78,drumY+Math.sin(a)*drumR*.78]],P.blue,3);circle(c,drumX,drumY,4,P.ink);line(c,[[ropeX,drumY],[ropeX,loadY-25]],P.blue,3);label('Катушка',drumX,55,P.ink,'center',12,true);line(c,[[drumX,drumY],[ropeX,drumY]],P.muted,1,[3,3]);label(fmt(st.r*100)+' см',drumX,drumY+drumR+19,P.muted,'center',10);
 }
 round(c,ropeX-24,loadY-24,48,45,7,P.blueS,P.blue);round(c,ropeX-8,loadY-29,16,6,2,P.bg,P.blue);label(fmt(st.m)+' кг',ropeX,loadY,P.blue,'center',12,true);
 // One free-body inset keeps every force visible, even when the real load touches the floor.
 // All three arrows use the same scale; the floor's reaction is an actual third force.
 const fx=18,fy=224,fw=small?142:205,bodyY=310,tx=fx+fw*.22,gx=fx+fw*.5,sx=fx+fw*.78,unit=28/Math.max(1,d.force,d.weight,d.support,d.stop);
 round(c,fx,fy,fw,158,8,P.bg,P.line);label('Силы на груз',fx+fw/2,fy+15,P.ink,'center',11,true);
 round(c,fx+15,bodyY-7,fw-30,14,4,P.blueS,P.blue);label('груз',gx,bodyY,P.blue,'center',9);
 arrow(c,tx,bodyY-7,-d.force*unit,P.blue);arrow(c,gx,bodyY+7,d.weight*unit,P.ink2);
 label('Тяга',tx,fy+31,P.blue,'center',10);label(fmt(d.force)+' Н',tx,fy+45,P.blue,'center',10.5,true);
 label('Тяжесть',gx,fy+129,P.ink2,'center',10);label(fmt(d.weight)+' Н',gx,fy+143,P.ink2,'center',10.5,true);
 if(d.support>.005){arrow(c,sx,bodyY-7,-d.support*unit,P.purple);label('Опора',sx,fy+31,P.purple,'center',10);label(fmt(d.support)+' Н',sx,fy+45,P.purple,'center',10.5,true);}
 if(d.stop>.005){arrow(c,sx,bodyY+7,d.stop*unit,P.purple);label('Упор',sx,fy+129,P.purple,'center',10);label(fmt(d.stop)+' Н',sx,fy+143,P.purple,'center',10.5,true);}
 label(movement(d)+' · '+fmt(Math.abs(st.v)*100,1)+' см/с',W/2,H-17,P.muted,'center',11);
}
document.querySelectorAll('[data-rope-mode]').forEach(b=>b.addEventListener('click',()=>setMode(+b.dataset.ropeMode)));
$('ropeMass').addEventListener('input',e=>{st.m=+e.target.value;sync();draw();});$('ropeRadius').addEventListener('input',e=>{st.r=+e.target.value/100;sync();draw();});$('ropeForce').addEventListener('input',e=>{st.F=+e.target.value;sync();draw();});$('ropeLift').addEventListener('click',toggle);
function frame(t){let dt=last?Math.min(.04,(t-last)/1000):0;last=t;clock=t/1000;if(visible&&!document.hidden){dt*=st.mode===0?.25:1;for(let i=0;i<4;i++)Object.assign(st,physical(st,dt/4));draw();if(t-lastUI>100){sync();lastUI=t;}}requestAnimationFrame(frame);}
new ResizeObserver(draw).observe(cv);new IntersectionObserver(es=>visible=es[0].isIntersecting).observe(cv);new MutationObserver(draw).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','class','style']});sync();draw();requestAnimationFrame(frame);
window.RopeLab={getState:()=>({...st,...derived()}),physical,forces,setMode,start,toggle,reset,setMass:m=>{st.m=clamp(m,.5,2);$('ropeMass').value=st.m;sync();draw();},setRadius:cm=>{st.r=clamp(cm,1,6)/100;$('ropeRadius').value=st.r*100;sync();draw();},setForce:F=>{st.F=clamp(F,0,25);$('ropeForce').value=st.F;sync();draw();}};
})();

;
(function(){'use strict';
const $=id=>document.getElementById(id),cv=$('armLoadCv');if(!cv)return;
const K=HeroKit,TAU=2*Math.PI,goal=35*Math.PI/180,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),fmt=(v,d=1)=>v.toLocaleString('ru-RU',{minimumFractionDigits:d,maximumFractionDigits:d});
const st={q:0,v:0,r:.25,N:1,dragging:false};let G,last=0,lastUI=0,visible=true,status='';
function layout(){const narrow=cv.parentElement.getBoundingClientRect().width<480;G=narrow?{W:360,H:660,jx:92,py:300,L:235,mx:58,sx:143,gx:191,gearY:80}:{W:640,H:620,jx:190,py:235,L:280,mx:70,sx:155,gx:203,gearY:80};cv.style.aspectRatio=G.W+'/'+G.H;return G;}
function line(c,points,col,w=2,dash=[]){c.beginPath();c.moveTo(...points[0]);points.slice(1).forEach(p=>c.lineTo(...p));c.strokeStyle=col;c.lineWidth=w;c.lineCap='round';c.lineJoin='round';c.setLineDash(dash);c.stroke();c.setLineDash([]);}
function circle(c,x,y,r,fill,stroke,w=2){c.beginPath();c.arc(x,y,r,0,TAU);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=w;c.stroke();}}
function box(c,x,y,w,h,r,fill,stroke){c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=fill;c.fill();c.strokeStyle=stroke;c.lineWidth=1.5;c.stroke();}
function arrow(c,x,y,dx,dy,col,w=2){line(c,[[x,y],[x+dx,y+dy]],col,w);const a=Math.atan2(dy,dx),l=7;line(c,[[x+dx-l*Math.cos(a-.5),y+dy-l*Math.sin(a-.5)],[x+dx,y+dy],[x+dx-l*Math.cos(a+.5),y+dy-l*Math.sin(a+.5)]],col,w);}
function gear(c,x,y,r,z,a,col,soft,P){c.save();c.translate(x,y);c.rotate(a);c.beginPath();for(let i=0;i<z*4;i++){const ang=i*TAU/(z*4),rr=r+([1,2].includes(i%4)?1.8:-1.8);i?c.lineTo(rr*Math.cos(ang),rr*Math.sin(ang)):c.moveTo(rr*Math.cos(ang),rr*Math.sin(ang));}c.closePath();c.fillStyle=soft;c.fill();c.strokeStyle=col;c.lineWidth=1.5;c.stroke();for(let i=0;i<3;i++){const b=i*TAU/3;line(c,[[Math.cos(b)*r*.25,Math.sin(b)*r*.25],[Math.cos(b)*r*.72,Math.sin(b)*r*.72]],col,2);}circle(c,0,0,3,P.bg,col,1.5);c.restore();}
function physical(s,dt){const load=10*s.r*Math.cos(s.q),cap=s.N,requested=load+7*(goal-s.q)-1.6*s.v,torque=clamp(requested,-cap,cap),J=.06+s.r*s.r+.001*s.N*s.N;let v=clamp(s.v+(torque-load-.25*s.v)/J*dt,-3/s.N,3/s.N),q=s.q+v*dt;if(q< -1.52){q=-1.52;v=Math.max(0,v);}if(q>1.15){q=1.15;v=Math.min(0,v);}return {q,v,load,torque};}
function setDistance(cm){st.r=clamp(cm,8,45)/100;$('armLoadDistance').value=Math.round(st.r*100);sync();draw();}
function setRatio(n){st.N=+n===3?3:1;document.querySelectorAll('[data-arm-n]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.armN===st.N)));sync();draw();}
function sync(){const cm=Math.round(st.r*100),load=10*st.r*Math.cos(st.q),targetLoad=10*st.r*Math.cos(goal);$('armLoadDistanceOut').textContent=cm+' см';$('armLoadDistance').style.setProperty('--fill',(cm-8)/37*100+'%');$('armLoadAvailable').textContent=fmt(st.N)+' Н·м';$('armLoadGravity').textContent=fmt(load)+' Н·м';$('armLoadRead').textContent='Груз — 1 кг. По горизонтали до линии силы: '+fmt(100*st.r*Math.cos(st.q),0)+' см. Угол руки: '+fmt(st.q*180/Math.PI,0)+'°.';
const code=targetLoad>st.N?'weak':Math.abs(st.q-goal)<.03&&Math.abs(st.v)<.05?'held':'going';if(code!==status){status=code;$('armLoadExplanation').textContent=code==='weak'?'До пунктира не поднять: там момент груза больше доступного. Рука опустится и найдёт положение, где груз слабее поворачивает её вниз.':code==='held'?'Рука держит груз у цели. Теперь передвинь его дальше: вес останется тем же, а требуемый момент изменится.':'Мотор поднимает руку к цели. Следи за пунктирным горизонтальным расстоянием: оно меняется и при повороте руки.';}}
function draw(){layout();const {c,k}=K.fit(cv,G.W,G.H),P={ink:K.css('--ink'),ink2:K.css('--ink-2'),muted:K.css('--ink-3'),edge:K.css('--line-2'),bg:K.css('--surface'),surf:K.css('--surface-2'),grid:K.css('--grid'),mot:K.css('--e2e'),motS:K.css('--e2e-soft'),out:K.css('--classic'),outS:K.css('--classic-soft'),gear:K.css('--hybrid'),gearS:K.css('--hybrid-soft')};c.fillStyle=P.bg;c.fillRect(0,0,G.W,G.H);K.grid(c,G.W,G.H,22,P.grid);const lab=(t,x,y,o={})=>K.label(c,k,t,x,y,{px:11.5,color:P.ink2,haloColor:P.bg,...o}),{jx,py,L,mx,sx,gx,gearY:my}=G,narrow=G.W===360;
// Разрез плеча отдельно от внешнего вида руки: мотор не похож на её сустав.
box(c,18,16,300,133,10,P.bg,P.edge);lab('Внутри плеча',32,35,{align:'left',color:P.muted});
box(c,mx-25,my-25,50,50,7,P.surf,P.ink2);for(let i=0;i<6;i++){const a=i*TAU/6;c.save();c.translate(mx,my);c.rotate(a);box(c,12,-4,8,8,2,P.motS,P.mot);c.restore();}circle(c,mx,my,11,P.motS,P.mot);const ma=st.N===3?3*st.q:-st.q;line(c,[[mx,my],[mx+9*Math.cos(ma),my+9*Math.sin(ma)]],P.mot,2);lab('Мотор',mx,130,{color:P.mot,weight:700});
line(c,[[mx+25,my],[sx,my]],P.ink2,3);
if(st.N===3){gear(c,sx,my,12,12,3*st.q,P.mot,P.motS,P);gear(c,gx,my,36,36,-st.q+Math.PI/36,P.gear,P.gearS,P);lab('Редуктор 3 : 1',198,130,{color:P.gear,weight:700});line(c,[[gx,my],[290,my]],P.ink2,3);}else{line(c,[[sx,my],[290,my]],P.ink2,4);lab('Вал напрямую',210,130,{weight:600});}
circle(c,290,my,4,P.out);line(c,[[jx,150],[jx,py-22]],P.muted,1,[3,4]);
// Неподвижный корпус робота и плечевой шарнир.
const bx=narrow?24:88,bw=jx-bx-10;box(c,bx,py-7,bw,132,12,P.surf,P.ink2);box(c,bx+10,py+24,Math.max(20,bw-20),44,5,P.bg,P.edge);for(let i=0;i<3;i++)line(c,[[bx+15,py+35+i*10],[bx+bw-15,py+35+i*10]],P.edge,2);line(c,[[bx+bw/2,py+125],[bx+bw/2,py+168]],P.ink2,17);box(c,bx-6,py+166,bw+12,13,4,P.surf,P.ink2);
const ex=jx+L*Math.cos(st.q),ey=py-L*Math.sin(st.q),tx=jx+L*Math.cos(goal),ty=py-L*Math.sin(goal);line(c,[[jx,py],[tx,ty]],P.muted,1.5,[5,5]);lab('Цель 35°',narrow?G.W-18:tx,narrow?ty+30:ty-14,{color:P.muted,align:narrow?'right':'center'});
line(c,[[jx,py],[ex,ey]],P.ink2,23);line(c,[[jx,py],[ex,ey]],P.surf,19);line(c,[[jx+25*Math.cos(st.q),py-25*Math.sin(st.q)],[ex-20*Math.cos(st.q),ey+20*Math.sin(st.q)]],P.out,4);circle(c,jx,py,21,P.surf,P.ink2);circle(c,jx,py,12,P.outS,P.out);circle(c,jx,py,4,P.ink2);circle(c,ex,ey,8,P.surf,P.ink2);
c.save();c.translate(ex,ey);c.rotate(-st.q);line(c,[[5,-10],[17,-10],[17,-4]],P.ink2,3);line(c,[[5,10],[17,10],[17,4]],P.ink2,3);c.restore();
const d=st.r/.48*L,px=jx+d*Math.cos(st.q),pY=py-d*Math.sin(st.q),sz=17;box(c,px-sz,pY-sz,sz*2,sz*2,5,P.outS,P.out);for(let i=-1;i<=1;i++)line(c,[[px+i*5,pY-10],[px+i*5,pY+10]],P.out,1);if(st.dragging)circle(c,px,pY,25,null,P.out,1.5);lab('1 кг',px,pY-27,{color:P.out,weight:700});
// Сила вертикальна, её плечо — горизонтально: обе геометрии видны рядом.
arrow(c,px+23,pY+3,0,38,P.mot,2);lab('10 Н',px+32,pY+49,{color:P.mot});const measureY=Math.max(py,pY)+66;line(c,[[jx,py+24],[jx,measureY+5]],P.muted,1,[3,4]);line(c,[[px,pY+24],[px,measureY+5]],P.muted,1,[3,4]);line(c,[[jx,measureY],[px,measureY]],P.muted,1);line(c,[[jx,measureY-4],[jx,measureY+4]],P.muted,1);line(c,[[px,measureY-4],[px,measureY+4]],P.muted,1);lab('по горизонтали: '+fmt(st.r*Math.cos(st.q)*100,0)+' см',Math.max(narrow?135:220,(jx+px)/2),measureY+21,{color:P.muted});
lab('Перетаскивай синий груз вдоль руки',G.W/2,G.H-17,{color:P.muted});cv.style.cursor=st.dragging?'grabbing':'grab';}
function point(e){const b=cv.getBoundingClientRect();return{x:(e.clientX-b.left)*G.W/b.width,y:(e.clientY-b.top)*G.H/b.height};}
function hit(p){const d=st.r/.48*G.L;return Math.hypot(p.x-G.jx-d*Math.cos(st.q),p.y-G.py+d*Math.sin(st.q))<28;}
cv.addEventListener('pointerdown',e=>{if(!hit(point(e)))return;st.dragging=true;cv.setPointerCapture(e.pointerId);e.preventDefault();});cv.addEventListener('pointermove',e=>{if(!st.dragging)return;const p=point(e),d=(p.x-G.jx)*Math.cos(st.q)-(p.y-G.py)*Math.sin(st.q);setDistance(d/G.L*48);e.preventDefault();});function release(e){st.dragging=false;if(cv.hasPointerCapture(e.pointerId))cv.releasePointerCapture(e.pointerId);}cv.addEventListener('pointerup',release);cv.addEventListener('pointercancel',release);
$('armLoadDistance').addEventListener('input',e=>setDistance(+e.target.value));$('armLoadMode').addEventListener('click',e=>{const b=e.target.closest('[data-arm-n]');if(b)setRatio(+b.dataset.armN);});
function frame(t){const dt=last?Math.min(.04,(t-last)/1000):0;last=t;if(visible&&!document.hidden){for(let i=0;i<4;i++)Object.assign(st,physical(st,dt/4));draw();if(t-lastUI>150){sync();lastUI=t;}}requestAnimationFrame(frame);}new ResizeObserver(draw).observe(cv);new IntersectionObserver(e=>{visible=e[0].isIntersecting;}).observe(cv);K.onTheme(draw);layout();sync();draw();requestAnimationFrame(frame);
window.ArmLoadLab={getState:()=>({...st,goal,geometry:{...G}}),setDistance,setRatio,physical};
})();

;
(function(){'use strict';
const $=id=>document.getElementById(id),cv=$('legsCv');if(!cv)return;
const K=HeroKit,TAU=2*Math.PI,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),fmt=(v,d=0)=>v.toLocaleString('ru-RU',{minimumFractionDigits:d,maximumFractionDigits:d});
const C={L:.24,m:5,g:10,Jlink:.02,Jrotor:.00015,k:35000,c:100,kq:18,dq:1.2,q0:.8};
const PHYSICS_DT=.0001,TRACE_EVERY=10;
let mode='push',force=8,height=.08,states=[],running=false,visible=true,t=0,stopTime=2.4,last=0,uiTime=0,drag=null,G={W:640,H:470,narrow:false},geometry=[],remainder=0,stepCount=0;
function initState(N,m='push',h=.08){return{N,q:C.q0,w:0,y:2*C.L*Math.cos(C.q0/2)+h,v:0,t:0,F:0,peak:0,peakTime:0,maxq:C.q0,trace:[],contact:false,firstContact:null};}
function inertia(s){return C.Jlink+C.Jrotor*s.N*s.N;}
function physical(s,dt,opts={}){
 const m=opts.mode||'landing',J=inertia(s);let q=s.q,w=s.w,y=s.y,v=s.v,F=0;
 if(m==='landing'){
  const r=C.L*Math.sin(q/2),pen=2*C.L*Math.cos(q/2)-y;
  F=pen>0?Math.max(0,C.k*pen+C.c*(-r*w-v)):0;
  const brake=clamp(C.kq*(q-C.q0)+C.dq*w,-12,12);
  v+=(F/C.m-C.g)*dt;y+=v*dt;w+=(F*r-brake)/J*dt;q+=w*dt;
 }else{
  F=opts.force||0;const lever=C.L*Math.cos(q-.4),drive=F*lever;
  const friction=.08*Math.tanh(w*20)+.24*w;w+=(drive-friction)/J*dt;q+=w*dt;
 }
 if(q>1.9){q=1.9;w=Math.min(0,w);}if(q<.25){q=.25;w=Math.max(0,w);}
 return{...s,q,w,y,v,F,t:s.t+dt,peak:Math.max(s.peak,m==='landing'?F:Math.abs(F)),peakTime:F>s.peak?s.t:s.peakTime,maxq:Math.max(s.maxq,q),contact:s.contact||F>0,firstContact:s.firstContact??(m==='landing'&&F>0?s.t:null)};
}
function reset(){states=[initState(6,mode,height),initState(60,mode,height)];running=false;t=0;remainder=0;stepCount=0;stopTime=2.4;drag=null;sync();draw();}
function start(){reset();if(window.innerWidth<=900){cv.scrollIntoView({block:'start',behavior:'instant'});window.scrollBy({top:-80,behavior:'instant'});}running=true;ensureFrame();}
function setMode(m){mode=m==='landing'?'landing':'push';document.querySelectorAll('[data-leg-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.legMode===mode)));$('legsForceRow').hidden=mode!=='push';$('legsHeightRow').hidden=mode!=='landing';$('legsRun').textContent=mode==='push'?'Толкнуть обоих':'Приземлить обоих';$('legsKicker').textContent=mode==='push'?'Опыт · Движение снаружи':'Опыт · Первое касание земли';$('legsTitle').textContent=mode==='push'?'Теперь нога вращает мотор':'Колено должно успеть согнуться';$('legsIntro').textContent=mode==='push'?'Моторы выключены, бёдра закреплены. Потяни любую стопу влево или толкни обе кнопкой. Сравни сгибание колен и вращение шестерёнок.':'Одинаковые роботы падают с одной высоты. Смотри на первое касание: нога сгибается и раскручивает мотор. Сравни ноги с передачами 6 : 1 и 60 : 1.';$('legsMeasureTitle').textContent=mode==='push'?'Максимальное сгибание после толчка':'Пик силы за приземление · время пика';$('legsModelNote').textContent=mode==='push'?'Учебная модель: одинаковые моторы, сила действует 0,15 с, вес звеньев не учитывается. Трение одинаково и мало. Анимация замедлена в 3 раза.':'Учебная модель: масса 5 кг, g ≈ 10 м/с²; одинаковые моторы, упругий пол и управление коленом. F − mg = ma, где a — ускорение корпуса вверх. При торможении падения сила пола выше веса. После успокоения F ≈ mg = 50 Н. Анимация ×⅓.';reset();}
function sync(){
 $('legsForceOut').textContent=force+' Н';$('legsHeightOut').textContent=Math.round(height*100)+' см';
 $('legsForce').style.setProperty('--fill',((force-2)/14*100)+'%');$('legsHeight').style.setProperty('--fill',((height*100-2)/10*100)+'%');
 ['legsValueA','legsValueB'].forEach((id,i)=>{$(id).textContent=t===0?'—':mode==='push'?fmt((states[i].maxq-C.q0)*180/Math.PI,1)+'°':fmt(states[i].peak)+' Н · '+fmt(states[i].peakTime,2)+' с';});
 const finished=!running&&t>0&&t>=stopTime-1e-8,finishNote=finished?' Показаны первые '+fmt(t,1)+' с. Нажми кнопку опыта, чтобы повторить.':'';
 $('legsRead').textContent=(mode==='push'?'Тяни стопу влево: одинаковая сила действует на обе ноги. '+(t>0?'Прошло '+fmt(t,2)+' с опыта.':''):'Одинаковая высота и масса · прошло '+fmt(t,2)+' с опыта · оранжевая шестерёнка — вход от мотора, синяя — выход к колену.')+finishNote;
 let text;if(mode==='push')text=t===0?'Обратимость — возможность двигать механизм со стороны ноги. Мотор не включён, но его ротор всё равно приходится раскручивать.':'При передаче 60 : 1 для того же движения колена нужно быстрее разогнать такой же ротор. Тот же толчок слабее сгибает ногу, но передача не блокирует её.';
 else {const contacts=states.map(s=>s.firstContact).filter(v=>v!==null),sinceContact=contacts.length?t-Math.min(...contacts):null;text=t===0?'При первом касании мотор ещё не вращается. Чтобы колено согнулось, контакт должен сначала раскрутить ротор через редуктор.':sinceContact===null?'Оба тела падают. Колени пока не сгибаются, роторы неподвижны.':sinceContact<.22?'Стопы встретили пол. Для быстрого сгибания колена передача 60 : 1 требует сильнее разогнать тот же ротор.':'Сравни пики силы. В этой модели передача 60 : 1 усиливает первый удар: нога сильнее сопротивляется быстрому сгибанию. У настоящего робота результат зависит и от конструкции, трения и управления.';}
 const atLimit=states.filter(s=>s.maxq>=1.9-1e-6);if(atLimit.length)text+=' Нога '+atLimit.map(s=>s.N+' : 1').join(' и ')+' дошла до конструктивного упора: дальше сустав не сгибается.';
 if(mode==='landing'&&states.every(s=>s.firstContact!==null)&&states.every(s=>Math.abs(s.v)<.01&&Math.abs(s.F-C.m*C.g)<2))text='Сейчас оба робота почти успокоились: пол держит по 5 кг, поэтому сила около 50 Н. В таблице остались пики первого удара, а не текущая сила. Пик зависит от редуктора, упругости пола и управления коленом.';
 if(finished)text+=' Опыт остановлен на '+fmt(t,1)+' с для сравнения. Колебания могли бы продолжиться.';
 if($('legsExplanation').textContent!==text)$('legsExplanation').textContent=text;
}
function line(c,pts,col,w=2,dash=[]){c.beginPath();c.moveTo(...pts[0]);pts.slice(1).forEach(p=>c.lineTo(...p));c.strokeStyle=col;c.lineWidth=w;c.lineCap='round';c.lineJoin='round';c.setLineDash(dash);c.stroke();c.setLineDash([]);}
function circle(c,x,y,r,fill,stroke,w=1.5){c.beginPath();c.arc(x,y,r,0,TAU);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=w;c.stroke();}}
function rect(c,x,y,w,h,r,fill,stroke){c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=fill;c.fill();c.strokeStyle=stroke;c.lineWidth=1.5;c.stroke();}
function arrow(c,x,y,dx,dy,col){const a=Math.atan2(dy,dx),end=[x+dx,y+dy];line(c,[[x,y],end],col,2.5);line(c,[[end[0]-8*Math.cos(a-.5),end[1]-8*Math.sin(a-.5)],end,[end[0]-8*Math.cos(a+.5),end[1]-8*Math.sin(a+.5)]],col,2.5);}
function gear(c,x,y,r,teeth,angle,col,soft,P){
 c.save();c.translate(x,y);c.rotate(angle);c.beginPath();const tooth=Math.min(1.3,r*.22);
 for(let n=0;n<teeth*4;n++){const a=n*TAU/(teeth*4),rr=r+((n%4===1||n%4===2)?tooth:-tooth);n?c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr):c.moveTo(Math.cos(a)*rr,Math.sin(a)*rr);}
 c.closePath();c.fillStyle=soft;c.fill();c.strokeStyle=col;c.lineWidth=r<8?1:1.3;c.stroke();
 if(r>8){for(let n=0;n<3;n++){const a=n*TAU/3;line(c,[[Math.cos(a)*r*.2,Math.sin(a)*r*.2],[Math.cos(a)*r*.73,Math.sin(a)*r*.73]],col,1.6);}circle(c,r*.77,0,2.2,col);}
 else line(c,[[0,0],[r*.8,0]],col,1.5);
 circle(c,0,0,Math.min(3,r*.28),P.bg,col,1);c.restore();
}
function draw(){
 const narrow=cv.parentElement.getBoundingClientRect().width<520;G={W:narrow?360:640,H:narrow?810:470,narrow};cv.style.aspectRatio=G.W+'/'+G.H;
 const {c,k}=K.fit(cv,G.W,G.H),P={ink:K.css('--ink'),ink2:K.css('--ink-2'),muted:K.css('--ink-3'),bg:K.css('--surface'),surf:K.css('--surface-2'),line:K.css('--line-2'),grid:K.css('--grid'),blue:K.css('--classic'),blueS:K.css('--classic-soft'),orange:K.css('--e2e'),orangeS:K.css('--e2e-soft'),purple:K.css('--hybrid'),purpleS:K.css('--hybrid-soft')};
 c.fillStyle=P.bg;c.fillRect(0,0,G.W,G.H);K.grid(c,G.W,G.H,22,P.grid);geometry=[];
 const lab=(str,x,y,opt={})=>K.label(c,k,str,x,y,{px:11.5,color:P.ink2,haloColor:P.bg,...opt});
 for(let i=0;i<2;i++){
  const s=states[i],ox=narrow?0:i*320,oy=narrow?i*405:0,pw=narrow?360:320,floor=oy+(narrow?294:330),scale=narrow?260:340,hx=ox+(narrow?104:86),hy=mode==='landing'?floor-s.y*scale:oy+(narrow?142:152),L=C.L*scale;
  const beta=mode==='landing'?s.q/2:.4,kx=hx+L*Math.sin(beta),ky=hy+L*Math.cos(beta),fx=kx-L*Math.sin(s.q-beta),fy=ky+L*Math.cos(s.q-beta);
  geometry.push({hip:{x:hx,y:hy},knee:{x:kx,y:ky},foot:{x:fx,y:fy},floor,ox,oy});
  if(i===1)line(c,narrow?[[16,oy],[G.W-16,oy]]:[[ox,14],[ox,G.H-14]],P.line,1);
  lab('Передача '+s.N+' : 1',ox+pw/2,oy+27,{weight:700,px:14});
  lab(mode==='push'?'Бедро закреплено':'Тело 5 кг',hx,oy+51,{color:P.muted});
  // Recognisable torso, hip shell, articulated thigh and shin, and a foot sole.
  rect(c,hx-29,hy-54,58,43,9,P.surf,P.ink2);rect(c,hx-18,hy-84,36,25,7,P.bg,P.ink2);line(c,[[hx-10,hy-73],[hx+10,hy-73]],P.blue,3);line(c,[[hx,hy-11],[hx,hy]],P.ink2,6);
  if(mode==='push'){line(c,[[hx-42,hy-30],[hx-32,hy-30]],P.ink2,5);line(c,[[hx-44,hy-65],[hx-44,hy+10]],P.ink2,2);for(let j=0;j<7;j++)line(c,[[hx-54,hy-63+j*11],[hx-44,hy-53+j*11]],P.muted,1);}
  for(const [a,b] of [[{x:hx,y:hy},{x:kx,y:ky}],[{x:kx,y:ky},{x:fx,y:fy}]]){line(c,[[a.x,a.y],[b.x,b.y]],P.ink2,18);line(c,[[a.x,a.y],[b.x,b.y]],P.blueS,14);line(c,[[a.x,a.y],[b.x,b.y]],P.blue,3);}
  circle(c,hx,hy,11,P.bg,P.ink2,2);circle(c,hx,hy,4,P.blue);
  circle(c,kx,ky,17,P.bg,P.ink2,2);circle(c,kx,ky,11,P.purpleS,P.purple,1.5);for(let z=0;z<8;z++){const a=z*TAU/8-s.q;line(c,[[kx+Math.cos(a)*9,ky+Math.sin(a)*9],[kx+Math.cos(a)*13,ky+Math.sin(a)*13]],P.purple,1.3);}circle(c,kx,ky,3,P.purple);
  circle(c,fx,fy,7,P.bg,P.ink2,2);rect(c,fx-14,fy-4,37,9,4,P.surf,P.ink2);
  // Reducer cutaways. First mesh has pitch radii 5:30 (10/60 teeth).
  // The 60:1 example adds a 4:40 mesh (8/80 teeth) on the intermediate shaft.
  // These are schematic examples of reduction, not a model of a particular product.
  const bx=ox+pw-145,bw=130,y1=oy+112,y2=oy+193,dq=s.q-C.q0,two=s.N===60,mx=bx+(two?86:67),sx=mx-35,x2=mx-44;
  const outX=two?x2:mx,outY=two?y2:y1;
  line(c,[[kx+18,ky],[bx-12,ky],[bx-12,outY],[bx,outY]],P.muted,1,[3,4]);
  rect(c,bx,oy+72,bw,two?170:82,9,P.surf,P.line);
  lab('Редуктор',bx+bw/2,oy+55,{weight:700,color:P.purple});
  const inputAngle=two?-60*dq:6*dq,intermediateAngle=two?10*dq:-dq;
  gear(c,sx,y1,5,10,inputAngle,P.orange,P.orangeS,P);
  gear(c,mx,y1,30,60,intermediateAngle,two?P.purple:P.blue,two?P.purpleS:P.blueS,P);
  lab('×6',two?bx+18:bx+bw-11,y1,{align:two?'left':'right',color:P.purple,weight:700,px:10.5});
  if(two){
   // Exploded views of the same shaft, not a belt or an extra transmission.
   // Dotted projection and its label distinguish this from meshing teeth.
   line(c,[[mx,y1+33],[mx,y2-8]],P.muted,1,[2,4]);
   lab('Общий вал',bx+39,oy+147,{color:P.muted,px:10});
   line(c,[[bx+73,oy+147],[mx,oy+153]],P.muted,1);
   gear(c,x2,y2,40,80,-dq,P.blue,P.blueS,P);
   // Paint the pinion last so neither the projection nor the wheel hides it.
   gear(c,mx,y2,4,8,intermediateAngle,P.purple,P.purpleS,P);
   lab('×10',bx+bw-11,y2,{align:'right',color:P.purple,weight:700,px:10.5});
  }
  circle(c,sx,y1,1.5,P.orange);circle(c,outX,outY,3,P.blue);
  const captionY=oy+(two?253:174);
  lab(two?'6 × 10 = 60 : 1':'Одна ступень · 6 : 1',bx+bw/2,captionY,{color:P.purple,weight:650,px:10.5});
  lab('Вход: '+fmt(Math.abs(s.N*dq)/TAU,2)+' об.',bx+bw/2,captionY+19,{color:P.orange,px:10.5});
  lab('Сгибание: '+(dq>=0?'+':'−')+fmt(Math.abs(dq)*180/Math.PI,1)+'°',bx+bw/2,captionY+36,{color:P.blue,px:10.5});
  lab('Колено',kx-24,ky+26,{align:'right',color:P.purple});
  if(mode==='landing'){
   line(c,[[ox+18,floor+6],[ox+pw-18,floor+6]],P.ink2,2);for(let j=ox+20;j<ox+pw-20;j+=12)line(c,[[j,floor+7],[j-6,floor+14]],P.muted,1);
   if(s.F>1)arrow(c,fx+37,fy+4,0,-clamp(s.F/7,8,55),P.purple);
   lab('Сейчас: '+fmt(s.F)+' Н от пола',ox+pw/2,floor+34,{color:P.purple});
  }else{
   const f=drag?drag.force:running&&t<.15?force:0;if(Math.abs(f)>.1){arrow(c,fx+10,fy+24,-f*3,0,P.purple);lab(fmt(Math.abs(f),1)+' Н',fx,fy+46,{color:P.purple});}else lab('← потяни стопу',ox+pw/2,floor+7,{color:P.muted});
  }
  const gy=oy+(narrow?362:410),gh=narrow?32:36,gx=ox+34,gw=pw-58,horizon=Math.max(2.4,t);
  line(c,[[gx,gy-gh],[gx,gy],[gx+gw,gy]],P.line,1);
  if(s.trace.length>1){const max=mode==='landing'?650:1.2;line(c,s.trace.map(p=>[gx+Math.min(p.t/horizon,1)*gw,gy-Math.min(p.v/max,1)*gh]),mode==='landing'?P.purple:P.blue,1.8);}
  lab(mode==='landing'?'650 Н':'69°',gx+2,gy-gh-6,{px:9.5,color:P.muted,align:'left'});lab('0',gx-9,gy+3,{px:9.5,color:P.muted});lab(fmt(horizon,1)+' с',gx+gw,gy+12,{px:9.5,color:P.muted,align:'right'});
  lab(mode==='landing'?'Сила со стороны пола':'Сгибание колена',ox+pw/2,gy+30,{px:10.5,color:P.muted});
 }
 cv.style.cursor=mode==='push'?(drag?'grabbing':'grab'):'default';
}
function stepFrame(dt){
 remainder+=Math.min(dt,Math.max(0,stopTime-t));
 while(remainder>=PHYSICS_DT-1e-12&&t<stopTime-1e-10){
  const h=Math.min(PHYSICS_DT,stopTime-t),F=drag?drag.force:t<.15-1e-10?force:0;
  states=states.map(s=>physical(s,h,{mode,force:F}));t+=h;remainder-=h;stepCount++;
  if(stepCount%TRACE_EVERY===0)states.forEach(s=>{s.trace.push({t,v:mode==='landing'?s.F:Math.max(0,s.q-C.q0)});if(s.trace.length>12000)s.trace.splice(0,1000);});
 }
 if(!drag&&t>=stopTime-1e-10){t=stopTime;remainder=0;running=false;}
}
let raf=0;
function frame(now){raf=0;const dt=last?Math.min((now-last)/1000,.05)/3:0;last=now;if(running&&visible&&!document.hidden){stepFrame(dt);draw();if(now-uiTime>100){sync();uiTime=now;}}if(running)raf=requestAnimationFrame(frame);else{last=0;sync();draw();}}
function ensureFrame(){if(!raf){last=0;raf=requestAnimationFrame(frame);}}
function pos(e){const b=cv.getBoundingClientRect();return{x:(e.clientX-b.left)*G.W/b.width,y:(e.clientY-b.top)*G.H/b.height};}
cv.addEventListener('pointerdown',e=>{if(mode!=='push')return;const p=pos(e),g=geometry.find(v=>Math.hypot(p.x-v.foot.x,p.y-v.foot.y)<34);if(!g)return;t=0;stopTime=Infinity;states.forEach(s=>{s.trace=[];s.maxq=s.q;});drag={x:p.x,force:0};running=true;cv.setPointerCapture(e.pointerId);e.preventDefault();ensureFrame();});
cv.addEventListener('pointermove',e=>{if(!drag)return;drag.force=clamp((drag.x-pos(e).x)*.2,-16,16);e.preventDefault();});
function release(e){if(!drag)return;drag=null;t=Math.max(t,.15);stopTime=t+1;if(cv.hasPointerCapture(e.pointerId))cv.releasePointerCapture(e.pointerId);}
cv.addEventListener('pointerup',release);cv.addEventListener('pointercancel',release);
$('legsRun').addEventListener('click',start);$('legsReset').addEventListener('click',reset);
$('legsMode').addEventListener('click',e=>{const b=e.target.closest('[data-leg-mode]');if(b)setMode(b.dataset.legMode);});
$('legsForce').addEventListener('input',e=>{force=+e.target.value;reset();});$('legsHeight').addEventListener('input',e=>{height=+e.target.value/100;reset();});
new ResizeObserver(draw).observe(cv);new IntersectionObserver(es=>{visible=es[0].isIntersecting;last=0;}).observe(cv);K.onTheme(draw);reset();
window.LegsLab={getState:()=>({mode,t,running,force,height,states:states.map(s=>({...s})),geometry}),physical,initState,constants:C,start,reset,setMode,stepFrame};
})();
