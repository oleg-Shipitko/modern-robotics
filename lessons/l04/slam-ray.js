/* Scan placement and correction against an existing wall/corner map. */
'use strict';
const CornerMatch=(()=>{
 const rad=d=>d*Math.PI/180;
 const map=[...Array.from({length:13},(_,i)=>({x:3,y:-1+i*.25})),...Array.from({length:10},(_,i)=>({x:.75+i*.25,y:2}))];
 const fresh=Array.from({length:5},(_,i)=>({x:.75-(i+1)*.12,y:2}));
 const scan=[...map,...fresh].map(p=>({...p}));
 const prediction={x:.35,y:-.25,angle:8};
 function place(points,pose){const c=Math.cos(rad(pose.angle)),s=Math.sin(rad(pose.angle));return points.map(p=>({x:pose.x+c*p.x-s*p.y,y:pose.y+s*p.x+c*p.y}));}
 function lines(points){let remaining=points.slice(),result=[];
  for(let k=0;k<2;k++){let best=null;
   for(let i=0;i<remaining.length;i++)for(let j=i+1;j<remaining.length;j++){
    const a=remaining[i],b=remaining[j],length=Math.hypot(a.x-b.x,a.y-b.y);if(length<.1)continue;
    const nx=(a.y-b.y)/length,ny=(b.x-a.x)/length,rho=nx*a.x+ny*a.y;
    const inliers=remaining.filter(p=>Math.abs(nx*p.x+ny*p.y-rho)<.001);
    if(!best||inliers.length>best.inliers.length)best={nx,ny,rho,inliers};
   }
   if(!best||best.inliers.length<3)throw Error('Two observed map walls required');
   result.push(best);remaining=remaining.filter(p=>!best.inliers.includes(p));
  }return result;
 }
 function score(points,walls){return Math.sqrt(points.reduce((sum,p)=>sum+Math.min(...walls.map(l=>(l.nx*p.x+l.ny*p.y-l.rho)**2)),0)/points.length);}
 function snapshot(angle=0,x=0,y=0){const pose={x:prediction.x+x/100,y:prediction.y+y/100,angle:prediction.angle+angle},placed=place(scan,pose);return{pose,placed,ref:map.map(p=>({...p})),fresh:place(fresh,pose),rms:score(placed,lines(map))};}
 function solve(points=scan,oldMap=map,pred=prediction){const walls=lines(oldMap);let best={rms:Infinity};
  const check=(angle,x,y)=>{const pose={x:pred.x+x/100,y:pred.y+y/100,angle:pred.angle+angle},rms=score(place(points,pose),walls);if(rms<best.rms)best={angle,x,y,rms};};
  for(let a=-12;a<=12.001;a+=.4)for(let x=-60;x<=60;x+=5)for(let y=-60;y<=60;y+=5)check(a,x,y);
  const coarse={...best};for(let a=coarse.angle-.4;a<=coarse.angle+.401;a+=.2)for(let x=coarse.x-4;x<=coarse.x+4;x++)for(let y=coarse.y-4;y<=coarse.y+4;y++)check(a,x,y);
  return{...best,angle:Math.round(best.angle*5)/5};
 }
 return{snapshot,solve,place,lines,score,map,scan,prediction};
})();

/* The true pose is only a teaching overlay. The scan matcher above never sees it.
   Coordinates and headings here are canvas coordinates, not map coordinates. */
function drawSlamPoseOverlay(c,k,P,real,estimate,narrow){
 const label=(text,x,y,color)=>HeroKit.label(c,k,text,x,y,{px:narrow?10:11,color,weight:750,align:'center',haloColor:P.bg});
 drawAda(c,real.x,real.y,real.angle,17,P.ink,1);
 c.strokeStyle=P.ink;c.lineWidth=2;c.beginPath();c.moveTo(real.x+19*Math.cos(real.angle),real.y+19*Math.sin(real.angle));c.lineTo(real.x+45*Math.cos(real.angle),real.y+45*Math.sin(real.angle));c.stroke();
 c.strokeStyle=P.e2e;c.lineWidth=2;c.setLineDash([5,4]);c.beginPath();c.arc(estimate.x,estimate.y,23,0,Math.PI*2);c.stroke();
 c.beginPath();c.moveTo(estimate.x,estimate.y);c.lineTo(estimate.x+49*Math.cos(estimate.angle),estimate.y+49*Math.sin(estimate.angle));c.stroke();c.setLineDash([]);
 label('РЕАЛЬНО',real.x,real.y-39,P.ink);
 const lx=estimate.x+(narrow?110:83),ly=estimate.y+39;
 c.strokeStyle=P.e2e;c.lineWidth=1;c.beginPath();c.moveTo(estimate.x+17,estimate.y+18);c.lineTo(lx-29,ly-6);c.stroke();label('ОЦЕНКА',lx,ly,P.e2e);
}

function drawSlamCorner(st){
 const cv=$('#slamRayCv'),narrow=cv.getBoundingClientRect().width<450,H=narrow?480:360;cv.style.aspectRatio='600 / '+H;const{c,k}=HeroKit.fit(cv,600,H),P=pal(),s=CornerMatch.snapshot(st.correction,st.cornerX||0,st.cornerY||0),ok=s.rms<.01;
 const scale=narrow?105:88,p=q=>({x:78+q.x*scale,y:(narrow?325:220)-q.y*scale}),label=(text,x,y,col=P.ink3,size=11,align='center')=>HeroKit.label(c,k,text,x,y,{px:size,color:col,weight:650,align,haloColor:P.bg});
 c.fillStyle=P.bg;c.fillRect(0,0,600,H);HeroKit.grid(c,600,H,44,P.grid);
 const line=(a,b,col,width=2,dash=[])=>{a=p(a);b=p(b);c.strokeStyle=col;c.lineWidth=width;c.setLineDash(dash);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();c.setLineDash([]);};
 line({x:3,y:-1},{x:3,y:2},P.ink,4);line({x:.75,y:2},{x:3,y:2},P.ink,4);
 // Real rays stay fixed even while the estimated pose and map placement change.
 for(const q of CornerMatch.scan){c.globalAlpha=.13;line({x:0,y:0},q,P.ink,.8);c.globalAlpha=1;}
 const col=st.cornerMapped?P.cl:P.e2e;
 for(const q of s.placed){c.globalAlpha=.2;line(s.pose,q,col,.8);c.globalAlpha=1;const z=p(q);c.fillStyle=col;c.beginPath();c.arc(z.x,z.y,3.5,0,Math.PI*2);c.fill();}
 for(const q of s.fresh){const z=p(q);c.fillStyle=st.cornerMapped?P.cl:P.e2e;c.beginPath();c.arc(z.x,z.y,3.5,0,Math.PI*2);c.fill();}
 if(st.cornerMapped){const added=st.cornerMap.slice(CornerMatch.map.length);line(added.at(-1),added[0],P.cl,4);}
 const real=p({x:0,y:0}),now=p(s.pose);drawSlamPoseOverlay(c,k,P,{...real,angle:0},{...now,angle:-s.pose.angle*Math.PI/180},narrow);
 label(narrow?'Прошлая карта':'Стены прошлой карты',narrow?410:420,25,P.ink,narrow?10:12);
 label('Новый участок',narrow?130:102,22,st.cornerMapped?P.cl:P.e2e,narrow?10:11);
 const axisY=narrow?410:274;c.strokeStyle=P.ink3;c.lineWidth=1.2;c.beginPath();c.moveTo(462,axisY);c.lineTo(510,axisY);c.moveTo(462,axisY);c.lineTo(462,axisY-44);c.stroke();label('+x',524,axisY+4);label('+y',462,axisY-56);
 if(!narrow){label('ОЦЕНКА СЕЙЧАС',470,143,P.e2e,11);label('x = '+fmt1(s.pose.x*100,0)+' см · y = '+fmt1(s.pose.y*100,0)+' см',470,163,P.e2e,11);label('курс = '+fmt1(s.pose.angle,1)+'°',470,182,P.e2e,11);}
 const distance=Math.hypot(s.pose.x,s.pose.y)*100;
 setOut($('#slamRayOut'),'Ошибка оценки: <b>'+fmt1(distance,1)+' см</b> и <b>'+fmt1(Math.abs(s.pose.angle),1)+'°</b>. Несовпадение скана с прошлой картой: <b>'+fmt1(s.rms*100,1)+' см</b>.<br>'+(st.cornerMapped?'Оценка исправлена; из неё новый участок записан в карту.':ok?'Оценка почти совпала с реальным положением. Теперь дополни карту.':'Двигается оценка и оранжевое изображение скана. Настоящая Ада и её измерения остаются на месте.'));
 for(const[id,value,unit]of[['srCorrection',st.correction,'°'],['srX',st.cornerX||0,' см'],['srY',st.cornerY||0,' см']]){const e=$('#'+id);e.value=value;e.nextElementSibling.textContent=fmt1(value,1)+unit;}
 $('#srWrite').disabled=!ok||!!st.cornerMapped;
}

/* A yaw-only scan placement experiment. The matcher sees earlier scan points,
   never the simulated true heading. Geometry is in metres, angles in degrees. */
const SlamRayLab=(()=>{
 const st={stage:0,range:3,angle:0,path:0,correction:0,seenOne:false,seenFar:false,returned:false,matched:false};let ctl=null;
 const rad=d=>d*Math.PI/180,clean=v=>Math.abs(v)<1e-10?0:v,fmt=(v,n=1)=>fmt1(clean(v),n),sgn=v=>(v>0?'+':'')+fmt(v,1),angles=[-20,-13.333333,-6.666667,0,6.666667,13.333333,20];
 function reference(r){return angles.map(a=>({x:r,y:r*Math.tan(rad(a)),a,range:r/Math.cos(rad(a))}));}
 function transform(points,angle){const c=Math.cos(rad(angle)),s=Math.sin(rad(angle));return points.map(p=>({x:c*p.x-s*p.y,y:s*p.x+c*p.y}));}
 function mismatch(points,previous){return Math.sqrt(points.reduce((sum,p)=>sum+Math.min(...previous.map(q=>(p.x-q.x)**2+(p.y-q.y)**2)),0)/points.length);}
 function current(){if(st.stage===2){const s=CornerMatch.snapshot(st.correction,st.cornerX||0,st.cornerY||0);return{...st,...s,realPose:{x:0,y:0,angle:0},estimatedPose:{...s.pose}};}const error=st.stage===1?st.path:st.angle,total=error+(st.stage===2?st.correction:0),ref=reference(st.range),placed=transform(ref,total),gap=Math.hypot(placed[3].x-ref[3].x,placed[3].y-ref[3].y);return{...st,error,total,ref,placed,gap,realPose:{x:0,y:0,angle:0},estimatedPose:{x:0,y:0,angle:-total},rms:mismatch(placed,ref)};}
 function draw(){if(st.stage===2){drawSlamCorner(st);return;}$('#slamRayCv').style.aspectRatio='20 / 11';const{c,k}=HeroKit.fit($('#slamRayCv'),600,330),P=pal(),s=current(),ox=80,oy=170,scale=88,narrow=$('#slamRayCv').getBoundingClientRect().width<500;const pt=p=>({x:ox+p.x*scale,y:oy+p.y*scale});
  c.fillStyle=P.bg;c.fillRect(0,0,600,400);HeroKit.grid(c,600,280,44,P.grid);
  const label=(text,x,y,color=P.ink3,size=11,align='center')=>HeroKit.label(c,k,text,x,y,{px:size,color,weight:650,align,haloColor:P.bg});
  label(st.stage===0?'Реальный курс и его оценка':st.stage===1?'Ада вернулась; оценка курса ушла':'Совмещаем новый скан с предыдущим',300,23,P.ink,narrow?10:12);
  const left=pt(s.ref[0]),right=pt(s.ref[6]);c.strokeStyle=P.ink3;c.lineWidth=st.stage===0?5:1;c.beginPath();c.moveTo(left.x,left.y-12);c.lineTo(right.x,right.y+12);c.stroke();
  for(const p of s.ref){const q=pt(p);c.beginPath();c.arc(q.x,q.y,3.3,0,7);c.fillStyle=P.ink;c.fill();}
  for(const p of s.ref){const q=pt(p);c.strokeStyle=P.ink;c.globalAlpha=.15;c.lineWidth=1;c.beginPath();c.moveTo(ox,oy);c.lineTo(q.x,q.y);c.stroke();c.globalAlpha=1;}
  const col=st.stage===2&&s.rms<.01?P.cl:P.e2e;
  for(let i=0;i<s.placed.length;i++){const q=pt(s.placed[i]);c.strokeStyle=col;c.globalAlpha=i===3?.9:.18;c.lineWidth=i===3?2:1;c.beginPath();c.moveTo(ox,oy);c.lineTo(q.x,q.y);c.stroke();c.globalAlpha=1;c.fillStyle=col;c.beginPath();c.arc(q.x,q.y,3.3,0,7);c.fill();}
  drawSlamPoseOverlay(c,k,P,{x:ox,y:oy,angle:0},{x:ox,y:oy,angle:rad(s.total)},narrow);label('стена',left.x+26,Math.max(49,left.y-16),P.ink);
  label('дальность: '+fmt(st.range)+' м',ox+st.range*scale/2,oy-15,P.ink3,11);
  const text=st.stage===2?'Поправка '+sgn(st.correction)+'° · несовпадение точек скана с предыдущим: <b>'+fmt(s.rms*100,1)+' см</b>.':st.stage===1?'Ада вернулась в прежнее место и повернута как раньше. Но после '+fmt(st.path,0)+' м <b>оценка курса ошибается на '+fmt(s.error,0)+'°</b>: стена на карте сместилась на <b>'+fmt(s.gap*100,1)+' см</b>.':'Реальная Ада смотрит прямо на стену. Ошибка <b>оценки курса '+fmt(s.total)+'°</b> смещает точку на карте на <b>'+fmt(s.gap*100,1)+' см</b>. Лидар правильно измеряет <b>'+fmt(st.range)+' м</b>.';
  setOut($('#slamRayOut'),text);
  for(const[id,value,unit]of[['srRange',st.range,' м'],['srAngle',st.angle,'°'],['srPath',st.path,' м'],['srCorrection',st.correction,'°']]){const e=$('#'+id);e.value=value;e.nextElementSibling.textContent=fmt(value,1)+unit;}
 }
 function set(key,value){st[key]=+value;if(st.stage===2){st.cornerMapped=false;st.cornerMap=null;}if(st.stage===0&&Math.abs(st.angle-1)<.01){if(Math.abs(st.range-3)<.01)st.seenOne=true;if(st.range>=3.9)st.seenFar=true;}if(st.stage===1&&st.path>=5)st.returned=true;if(st.stage===2&&current().rms<.01)st.matched=true;draw();if(ctl)ctl.update();}
 function auto(){if(st.stage===2){const best=CornerMatch.solve();set('correction',best.angle);set('cornerX',best.x);set('cornerY',best.y);return current();}const s=current(),observed=transform(s.ref,s.error);let best=0,score=Infinity;for(let i=-60;i<=60;i++){const correction=i*.2,err=mismatch(transform(observed,correction),s.ref);if(err<score){score=err;best=correction;}}set('correction',best);return current();}
 function stage(i){st.stage=i;st.cornerX=0;st.cornerY=0;st.cornerMapped=false;st.cornerMap=null;st.range=3;st.angle=i===2?6:0;st.path=0;st.correction=0;$('#srAuto').hidden=i!==2;$('#srWrite').hidden=i!==2;
  $('#slamRayNote').textContent=i===0?'Чёрная Ада — реальное положение и курс. Оранжевый пунктир — их оценка: здесь место известно точно, ошибается только оценка поворота. Показаны лучи к этой стене; лидар сканирует вокруг корпуса.':i===1?'Чёрная Ада вернулась в прежнюю позу. Оранжевый контур показывает, как программа ошибочно оценивает её поворот. Лидар измеряет верно; неверная оценка курса поворачивает скан при нанесении на план.':'Настоящее положение показано только ученику: SLAM его не знает. Он совмещает новый скан с прошлой картой, исправляя оценку позы, затем дополняет карту. У одной стены сдвиг вдоль неё незаметен; угол помогает проверить x и y. Показана часть кругового скана.';
  if(i===2){legend('#slamRayLegend',[['Ада и лучи в реальности; прошлая карта','var(--ink)','line'],['оценка и скан на плане','var(--e2e)','dash'],['добавлено в карту','var(--classic)','line']]);draw();return;}legend('#slamRayLegend',[['Ада, лучи и стена в реальности','var(--ink)','line'],['оценка поворота и скан на плане','var(--e2e)','dash']]);draw();}
 const api={reset(){Object.assign(st,{seenOne:false,seenFar:false,returned:false,matched:false});stage(0);},state:current,set,auto,reference,transform,mismatch};
 const missions=[
  {short:'Один скан',title:'Лидар точный. Почему точка не там?',text:'Поставь ошибку оценки курса 1°. Чёрная Ада не поворачивается; оранжевый пунктир показывает, как программа оценивает её поворот. Из этой оценки измерения наносятся на план, поэтому стена оказывается не там. Сравни расстояния 3 и 4 м.',controls:['range','angle'],onEnter:()=>stage(0),criteria:[{label:'Проверен 1° на расстоянии 3 м',test:(r,s)=>s.seenOne},{label:'Тот же 1° проверен на расстоянии 4 м',test:(r,s)=>s.seenFar}],explain:()=> 'Ошибка курса меняет направление, в котором мы откладываем измеренную дальность. При 1° и 3 м точка смещена на 5,2 см, при 4 м — на 7 см. Дальномер не ошибся: ошиблась поза, из которой его луч нанесли на карту.'},
  {short:'Стена снова',title:'Один градус — за каждый метр',text:'Первый скан уже записан на карте. Ада объехала комнату и вернулась в то же место с тем же поворотом. Но оценка по колёсам накопила ошибку 1° за каждый метр пути. Меняй длину объезда: настоящая Ада остаётся как прежде, оценка поворота уходит, а с ней съезжает стена на плане.',controls:['path'],onEnter:()=>stage(1),criteria:[{label:'Сравнены сканы после объезда хотя бы 5 м',test:(r,s)=>s.returned}],explain:()=> 'Один скан с ошибкой курса даёт повёрнутый отпечаток стены. Раздвоение появляется, когда на одну карту складывают сканы с разными ошибками позы. Увод 1°/м — не постоянный поворот всей карты на один градус.'},
  {short:'Совмести: SLAM',title:'Ада стоит. Исправляем её оценку',text:'Чёрная Ада — где робот действительно стоит. Оранжевый контур — его оценка своего положения и поворота. Она ушла, и из неё скан нанесён мимо стен. Поставь поправку курса −8°, затем двигай оценку по x и y до совпадения нового скана с прошлой картой. Настоящая Ада не перемещается. После совмещения запиши новый участок стены.',controls:['correction','x','y'],onEnter:()=>stage(2),criteria:[{label:'Удалось совместить скан с точностью до 1 см',test:(r,s)=>s.matched},{label:'Из исправленной позы добавлен новый участок карты',test:(r,s)=>s.cornerMapped}],explain:()=> 'Исправили оценку положения и поворота Ады, сохранив измеренные дальности и прошлую карту. В этом опыте оценка пришла к реальному положению: это проверка для нас, а SLAM выбрал позу по совпадению стен. Из неё записали новый участок карты.'}
 ];
 function init(){if(!$('#slamRayCv'))return null;for(const[id,key]of[['srRange','range'],['srAngle','angle'],['srPath','path'],['srCorrection','correction'],['srX','cornerX'],['srY','cornerY']])$('#'+id).addEventListener('input',e=>set(key,+e.target.value));$('#srAuto').addEventListener('click',auto);$('#srWrite').addEventListener('click',()=>{if(current().rms>=.01)return;st.cornerMap=[...CornerMatch.map.map(p=>({...p})),...current().fresh];st.cornerMapped=true;draw();ctl.update();});ctl=Missions.mount('#slamRayMis',missions,api,{controls:{range:'#srRangeWrap',angle:'#srAngleWrap',path:'#srPathWrap',correction:'#srCorrectionWrap',x:'#srXWrap',y:'#srYWrap'}});redrawOn(draw);draw();window.__slamRay={api,ctl};
  return ctl;}
 return{init,api};
})();
