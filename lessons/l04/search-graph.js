/* Dijkstra and A* on the same branching graph, using shared/anim.js. */
'use strict';
const SearchGraphLab=(()=>{
 const NODES=[{id:'S',x:20,y:125},{id:'A',x:95,y:125},{id:'B',x:175,y:125},{id:'C',x:255,y:125},{id:'T',x:330,y:125},{id:'U',x:55,y:40},{id:'V',x:140,y:30},{id:'W',x:225,y:30},{id:'X',x:300,y:45},{id:'D',x:90,y:215},{id:'E',x:185,y:215},{id:'F',x:280,y:210}];
 const EDGES=[['S','A',2,57,113],['A','B',2,135,113],['B','C',2,215,113],['C','T',2,292,113],['S','U',2.4,21,78],['U','V',2.2,100,19],['V','B',2.6,144,82],['V','W',2.2,183,17],['W','X',2.1,265,24],['X','T',2.3,328,83],['A','V',2.7,108,71],['B','W',2.7,211,77],['A','D',2.4,78,174],['D','E',2.5,138,229],['E','B',2.4,198,171],['E','F',2.6,235,229]];
 const byId=Object.fromEntries(NODES.map(p=>[p.id,p])),GOAL='T',INITIAL=1.2,CHOOSE=1.15,NEIGHBORS=1.45,STEP=CHOOSE+NEIGHBORS,HOLD=4;
 const heuristic=id=>Math.hypot(byId[id].x-byId[GOAL].x,byId[id].y-byId[GOAL].y)/40;
 const neighbors=id=>EDGES.flatMap(([a,b,cost])=>a===id?[[b,cost]]:b===id?[[a,cost]]:[]);
 function make(mode){return{mode,g:Object.fromEntries(NODES.map(p=>[p.id,p.id==='S'?0:Infinity])),parent:{},closed:[],current:null,done:false,path:null,cost:null};}
 const priority=(s,id)=>s.g[id]+(s.mode==='astar'?heuristic(id):0);
 function heuristicView(s,edge){
  if(s.mode!=='astar'||s.done)return null;
  const from=edge?edge.edge[1]:s.current;if(from==null)return null;
  return{from,to:GOAL,g:s.g[from],h:heuristic(from),priority:priority(s,from)};
 }
 function queue(s){if(s.done)return[];return NODES.map(n=>n.id).filter(id=>Number.isFinite(s.g[id])&&!s.closed.includes(id)).sort((a,b)=>priority(s,a)-priority(s,b)||s.g[b]-s.g[a]||a.localeCompare(b));}
 function snapshot(s){return{mode:s.mode,g:{...s.g},parent:{...s.parent},closed:[...s.closed],current:s.current,done:s.done,path:s.path?[...s.path]:null,cost:s.cost};}
 function choose(s){if(s.done)return;const id=queue(s)[0];if(id==null){s.done=true;return;}s.current=id;s.closed.push(id);if(id===GOAL){s.done=true;s.cost=s.g[id];s.path=[];for(let at=id;at!=null;at=s.parent[at])s.path.push(at);s.path.reverse();}}
 function relax(s){const trace=[];if(s.done)return trace;for(const[id,cost]of neighbors(s.current)){if(s.closed.includes(id))continue;const previous=s.g[id],candidate=s.g[s.current]+cost,improved=candidate<previous-1e-10;if(improved){s.g[id]=candidate;s.parent[id]=s.current;}trace.push({state:snapshot(s),edge:[s.current,id],previous,candidate,improved});}return trace;}
 function advance(s){choose(s);relax(s);return s;}
 function run(mode){const s=make(mode);for(let i=0;i<NODES.length+1&&!s.done;i++)advance(s);return s;}
 let D=null,cv=null,lastTime=0,initialized=false;
 function data(){if(D)return D;const left=make('dijkstra'),right=make('astar'),initial=[snapshot(left),snapshot(right)],steps=[];
  for(let i=0;i<NODES.length+1&&!(left.done&&right.done);i++){const before=[snapshot(left),snapshot(right)];choose(left);choose(right);const selected=[snapshot(left),snapshot(right)],traces=[relax(left),relax(right)];steps.push({before,selected,traces,after:[snapshot(left),snapshot(right)]});}
  return D={initial,steps,final:[snapshot(left),snapshot(right)],duration:INITIAL+steps.length*STEP+HOLD};
 }
 function frameAt(t){const d=data(),u=((t%d.duration)+d.duration)%d.duration;if(u<INITIAL)return{time:t,u,stage:0,phase:'start',step:0,states:d.initial,edges:[null,null],before:d.initial};
  const index=Math.floor((u-INITIAL)/STEP);if(index>=d.steps.length)return{time:t,u,stage:3,phase:'path',step:d.steps.length,states:d.final,edges:[null,null],before:d.final};
  const step=d.steps[index],local=u-INITIAL-index*STEP;if(local<CHOOSE)return{time:t,u,stage:1,phase:'choose',step:index+1,states:step.selected,edges:[null,null],before:step.before};
  const progress=(local-CHOOSE)/NEIGHBORS,states=[],edges=[];for(let side=0;side<2;side++){const trace=step.traces[side],at=Math.min(trace.length-1,Math.floor(progress*trace.length));states.push(at<0?step.selected[side]:trace[at].state);edges.push(at<0?null:trace[at]);}
  return{time:t,u,stage:2,phase:'neighbors',step:index+1,states,edges,before:step.before};
 }
 const format=(v,n=1)=>Math.abs(v)<1e-10?'0':Number.isFinite(v)?v.toLocaleString('ru-RU',{maximumFractionDigits:n}).replace('-','−'):'∞';
 function txt(c,k,A,text,x,y,maxWidth,opts={}){const px=opts.px||11.5;let size=px;A.K.font(c,k,size,opts.weight||650);while(c.measureText(String(text)).width>maxWidth&&size>8){size-=.5;A.K.font(c,k,size,opts.weight||650);}A.lab(c,k,String(text),x,y,{...opts,px:size});}
 function wrapped(c,k,A,text,x,y,w,P,px=13.5){A.K.font(c,k,px,750);const words=text.split(' '),lines=[];let line='';for(const word of words){const next=line?line+' '+word:word;if(line&&c.measureText(next).width>w){lines.push(line);line=word;}else line=next;}if(line)lines.push(line);lines.forEach((value,i)=>txt(c,k,A,value,x,y+i*px*1.32,w,{px,weight:750,color:P.ink,align:'left',halo:false}));}
 function pills(c,k,A,P,G,cur){const names=['Старт','Выбор вершины','Проверка соседей','Маршрут'];
  if(!G.narrow){const gap=8,w=(G.W-28-gap*3)/4;names.forEach((name,i)=>{const on=i===cur,done=i<cur,x=14+i*(w+gap);A.rect(c,x,12,w,28,14,on?A.alpha(P.out,.16):done?A.alpha(P.out,.06):P.surf,on?P.out:done?A.alpha(P.out,.45):P.line,on?1.8:1.1);txt(c,k,A,`${i+1} · ${name}`,x+w/2,26,w-12,{px:11,weight:on?800:650,color:on?P.ink:done?P.ink2:P.ink3,halo:false});});
  }else{const x0=25,dx=33;names.forEach((_,i)=>{const x=x0+i*dx,on=i===cur,done=i<cur;if(i)A.line(c,[[x-dx+12,26],[x-12,26]],done||on?A.alpha(P.out,.5):P.line,1.4);A.circle(c,x,26,11,on?P.out:done?A.alpha(P.out,.18):P.surf,on?P.out:done?A.alpha(P.out,.5):P.line,1.4);txt(c,k,A,i+1,x,26.5,20,{px:11,weight:800,color:on?P.surf:done?P.ink2:P.ink3,halo:false});});txt(c,k,A,names[cur],145,26,201,{px:12.5,weight:800,color:P.ink,align:'left',halo:false});}
 }
 function cap(frame){const[l,r]=frame.states;
  if(frame.stage===0)return'Один граф, один старт S и одна цель T. Разница только в правиле: Дейкстра выбирает по g, A* — по g + h.';
  if(frame.stage===3)return`Оба нашли кратчайший путь длиной ${format(r.cost)}. Дейкстра рассмотрела ${l.closed.length} вершин, A* — ${r.closed.length}: подсказка h помогла пропустить лишние ветви.`;
  if(frame.stage===2)return'Проверяем соседей выбранной вершины. Прибавляем длину ребра к g; если получилось короче прежнего, запоминаем новый путь.';
  if(r.done&&!l.done)return'A* уже выбрал цель и закончил поиск. Дейкстра ещё проверяет ветви с небольшим g: расстояние до цели в её приоритет не входит.';
  if(l.current!==r.current)return`Сейчас выбор разный: Дейкстра взяла ${l.current}, A* — ${r.current}. A* учитывает не только пройденную длину, но и остаток до T.`;
  return`Оба выбирают ${l.current}. У Дейкстры приоритет — длина от старта g; у A* к ней добавлена подсказка h о расстоянии до T.`;
 }
 function hintLabel(c,k,A,P,hint,node,at,G){
  const a=node(hint.from),b=node(hint.to),dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),normal=length?[-dy/length,dx/length]:[0,1];
  const text='h '+(hint.h===0?'= ':'≈ ')+format(hint.h),px=G.narrow?10:10.5;A.K.font(c,k,px,700);
  const width=c.measureText(text).width+6*k,height=(px+4)*k;
  const circles=NODES.map(n=>({p:at(n),r:10*G.scale+2*k}));
  const costs=EDGES.map(e=>({p:at({x:e[3],y:e[4]}),w:format(e[2]).length*5*k,h:10*k}));
  let best=null;
  for(const offset of[0,-14*k,14*k,-25*k,25*k])for(const f of[.5,.33,.67,.25,.75,.4,.6]){
   const x=a[0]+dx*f+normal[0]*offset,y=a[1]+dy*f+normal[1]*offset,rect={l:x-width/2,r:x+width/2,t:y-height/2,b:y+height/2};
   let score=Math.abs(offset)*.03+Math.abs(f-.5)*4;
   if(rect.l<G.x+6||rect.r>G.x+G.w-6||rect.t<G.y+28||rect.b>G.y+G.h-82)score+=1000;
   for(const o of circles){const qx=Math.max(rect.l,Math.min(rect.r,o.p[0])),qy=Math.max(rect.t,Math.min(rect.b,o.p[1]));if(Math.hypot(o.p[0]-qx,o.p[1]-qy)<o.r)score+=100;}
   for(const o of costs)if(rect.l<o.p[0]+o.w/2&&rect.r>o.p[0]-o.w/2&&rect.t<o.p[1]+o.h/2&&rect.b>o.p[1]-o.h/2)score+=15;
   if(!best||score<best.score)best={x,y,score};
  }
  txt(c,k,A,text,best.x,best.y,width,{px,weight:700,color:P.mot,halo:true,haloColor:P.surf});
 }
 function pane(c,k,A,P,s,old,edge,G,title){const{x,y,w,scale}=G,at=n=>[x+8+n.x*scale,y+27+n.y*scale],node=id=>at(byId[id]),hint=heuristicView(s,edge);
  A.rect(c,x,y,w,G.h,6,P.surf,P.line,1);txt(c,k,A,title,x+12,y+14,w-132,{px:12.5,weight:800,color:P.ink,align:'left',halo:false});
  for(const[a,b,cost,lx,ly]of EDGES){const route=s.path&&s.path.some((id,i)=>i&&((s.path[i-1]===a&&id===b)||(s.path[i-1]===b&&id===a))),hot=edge&&((edge.edge[0]===a&&edge.edge[1]===b)||(edge.edge[0]===b&&edge.edge[1]===a));A.line(c,[node(a),node(b)],hot?P.mot:route?P.out:P.line,hot||route?2.8:1.25);const p=at({x:lx,y:ly});txt(c,k,A,format(cost),p[0],p[1],36*scale,{px:G.narrow?9:9.5,weight:650,color:hot?P.mot:route?P.out:P.ink3,halo:true,haloColor:P.surf});}
  if(hint&&hint.h>0){const a=node(hint.from),b=node(hint.to),len=Math.hypot(b[0]-a[0],b[1]-a[1]),r=11*scale;if(len>2*r)A.line(c,[[a[0]+(b[0]-a[0])*r/len,a[1]+(b[1]-a[1])*r/len],[b[0]-(b[0]-a[0])*r/len,b[1]-(b[1]-a[1])*r/len]],P.mot,1.7,[5,4]);}
  for(const n of NODES){const p=at(n),closed=s.closed.includes(n.id),current=s.current===n.id&&!s.done,inspected=edge&&edge.edge[1]===n.id,open=Number.isFinite(s.g[n.id])&&!closed;A.circle(c,...p,10*scale,current?P.mot:closed?A.alpha(P.out,.18):P.surf,current||inspected?P.mot:closed||open?P.out:P.ink3,current||inspected?2:1.5);txt(c,k,A,n.id,p[0],p[1],20*scale,{px:G.narrow?10:10.5,weight:800,color:current?P.surf:P.ink,halo:false});}
  if(hint)hintLabel(c,k,A,P,hint,node,at,G);
  const qy=y+G.h-70,selected=edge?edge.edge[1]:s.current,chosen=selected!=null,gv=chosen?s.g[selected]:0,hv=chosen?heuristic(selected):heuristic('S'),f=gv+(s.mode==='astar'?hv:0);
  A.line(c,[[x+10,qy-8],[x+w-10,qy-8]],P.line,1);txt(c,k,A,chosen?(s.done?'Цель T выбрана':edge?'Проверяем '+selected:'Выбрана '+selected):'Пока известен только S',x+12,qy+3,w-24,{px:11.5,weight:800,color:s.done?P.out:P.ink,align:'left',halo:false});
  const math=s.mode==='astar'?`g + h = ${format(gv)} + ${format(hv)} = ${format(f)}`:`g = ${format(gv)} · подсказка h не используется`;txt(c,k,A,math,x+12,qy+22,w-24,{px:11,color:P.ink2,align:'left',halo:false});
  const candidateState=edge?s:old,candidates=queue(candidateState).slice(0,3).map(id=>`${id}: ${format(priority(candidateState,id))}`).join(' · ');txt(c,k,A,(s.done?'Путь '+s.path.join(' → '):'Кандидаты: '+candidates),x+12,qy+42,w-24,{px:10.5,color:P.ink3,align:'left',halo:false});
  txt(c,k,A,'Рассмотрено '+s.closed.length+' из '+NODES.length,x+w-12,y+14,w-150,{px:10,color:P.ink3,align:'right',halo:false});
 }
 function draw(c,k,t,P,A,G){lastTime=t;const frame=frameAt(t);pills(c,k,A,P,G,frame.stage);wrapped(c,k,A,cap(frame),14,58,G.W-28,P,G.narrow?12.5:13.5);
  for(let i=0;i<2;i++)pane(c,k,A,P,frame.states[i],frame.before[i],frame.edges[i],G.panels[i],i?'A* · g + h':'Дейкстра · g');
  const y=G.H-18;A.circle(c,22,y,4,P.mot,null);txt(c,k,A,'считаем сейчас',33,y,G.narrow?104:126,{px:10.5,color:P.ink2,align:'left',halo:false});A.circle(c,G.narrow?164:200,y,4,P.out,null);txt(c,k,A,'рассмотрено / путь',G.narrow?175:211,y,G.narrow?166:180,{px:10.5,color:P.ink2,align:'left',halo:false});
 }
 function state(){const f=frameAt(lastTime),out=s=>({...snapshot(s),g:Object.fromEntries(Object.entries(s.g).map(([id,v])=>[id,Number.isFinite(v)?v:null])),queue:queue(s).map(id=>({id,g:s.g[id],h:heuristic(id),priority:priority(s,id)}))});return{time:lastTime,step:f.step,phase:f.phase,stage:f.stage,playing:!!cv&&!cv.classList.contains('paused'),dijkstra:out(f.states[0]),astar:out(f.states[1]),hView:heuristicView(f.states[1],f.edges[1]),duration:data().duration};}
 function seek(t){lastTime=t;if(cv&&typeof Anim!=='undefined')Anim.seek(cv,t);return state();}
 function pause(){return seek(lastTime);}
 function play(){if(cv&&cv.classList.contains('paused'))cv.click();return state();}
 function reset(){return seek(0);}
 function step(){const f=frameAt(lastTime),next=Math.min(data().steps.length,f.step+1);return seek(next===data().steps.length?INITIAL+next*STEP+.01:INITIAL+next*STEP-.001);}
 const api={state,pause,play,reset,step,advance:seconds=>seek(lastTime+seconds),seek,make,advanceSearch:advance,run,heuristic,heuristicView,nodes:NODES,edges:EDGES,data,frameAt};
 function init(){if(initialized)return api;cv=document.getElementById('searchGraphCv');if(!cv)return null;initialized=true;
  Anim.add('search-graph',{W:720,H:510,start:0,narrowAt:700,draw(c,k,t,P,A){draw(c,k,t,P,A,{W:720,H:510,narrow:false,panels:[{x:14,y:112,w:340,h:354,scale:.93,narrow:false},{x:366,y:112,w:340,h:354,scale:.93,narrow:false}]});},narrow:{W:360,H:876,draw(c,k,t,P,A){draw(c,k,t,P,A,{W:360,H:876,narrow:true,panels:[{x:14,y:132,w:332,h:344,scale:.9,narrow:true},{x:14,y:490,w:332,h:344,scale:.9,narrow:true}]});}}});
  Anim.init();cv.addEventListener('keydown',e=>{if(e.code==='Space'||e.key==='Enter'){e.preventDefault();cv.click();}});window.__searchGraph=api;return api;
 }
 return{init,api};
})();
