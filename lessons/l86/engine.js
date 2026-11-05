/* Урок 8.6: детерминированные учебные модели задержки, очереди и планировщика. */
'use strict';
(function (root) {
  const clamp=(v,a,b)=>v<a?a:v>b?b:v;
  function mix32(x){x=Math.imul(x^(x>>>16),0x7feb352d)>>>0;x=Math.imul(x^(x>>>15),0x846ca68b)>>>0;return(x^(x>>>16))>>>0}
  function U(seed,a,b,c){let h=mix32((seed>>>0)^0x9e3779b9);h=mix32(h^(a>>>0));h=mix32((h+0x632be5ab+(b>>>0))>>>0);h=mix32(((h^0x85ebca6b)+(c>>>0))>>>0);return h/4294967296}
  function percentile(xs,p){const a=xs.slice().sort((x,y)=>x-y);return a[Math.floor((a.length-1)*p)]||0}
  const TOPOLOGIES={
    wifi:{id:'wifi',name:'сервер · Wi-Fi',short:'Wi-Fi',parts:['camera','resize','network','model','dispatch']},
    wired:{id:'wired',name:'сервер · провод',short:'провод',parts:['camera','resize','network','model','dispatch']},
    edge:{id:'edge',name:'локальный ускоритель',short:'локально',parts:['camera','resize','model','dispatch']},
  };
  function latencySample(mode,i){
    const r=j=>U(8601,i,j,mode==='wifi'?1:mode==='wired'?2:3);
    const camera=7+4*r(0),dispatch=4+3*r(4);let resize,network=0,model;
    if(mode==='wifi'){
      resize=10+8*r(1);network=14+8*r(2)+(i%11===0?48:0);model=82+12*r(3)+(i%17===0?28:0);
    }else if(mode==='wired'){
      resize=3+3*r(1);network=6+4*r(2)+(i%23===0?10:0);model=82+12*r(3)+(i%29===0?14:0);
    }else{
      resize=3+3*r(1);model=55+8*r(3)+(i%29===0?8:0);
    }
    const stages={camera,resize,network,model,dispatch};
    return{stages,total:Object.values(stages).reduce((s,x)=>s+x,0)};
  }
  function latencyProfile(mode,deadline,n){
    mode=TOPOLOGIES[mode]?mode:'wifi';deadline=clamp(+deadline||150,60,300);n=n||60;
    const samples=Array.from({length:n},(_,i)=>latencySample(mode,i));
    const totals=samples.map(x=>x.total),avg=totals.reduce((s,x)=>s+x,0)/n,p95=percentile(totals,.95),p99=percentile(totals,.99),misses=totals.filter(x=>x>deadline).length;
    const stageAvg={};Object.keys(samples[0].stages).forEach(k=>stageAvg[k]=samples.reduce((s,x)=>s+x.stages[k],0)/n);
    return{mode,topology:TOPOLOGIES[mode],deadline,n,samples,totals,avg,p95,p99,misses,missRate:misses/n,stageAvg,pass:p95<=deadline};
  }

  const QUEUE_MODES={
    fifo:{id:'fifo',name:'FIFO',short:'все кадры'},
    latest:{id:'latest',name:'Последний кадр',short:'свежий кадр'},
    predict:{id:'predict',name:'Последний + прогноз',short:'прогноз'},
  };
  function targetAt(t,speed){return .12+speed*t}
  function queueSim(mode,speed){
    mode=QUEUE_MODES[mode]?mode:'fifo';speed=clamp(+speed||.18,.05,.42);
    const dt=1/300,duration=2,cameraDt=1/30,infer=.12;let nextFrame=0,busyUntil=0,active=null,queue=[],lastCommand=.12,lastAge=0,maxQueue=0,dropped=0,processed=0;
    const trace=[];
    for(let step=0;step<=duration/dt;step++){
      const t=step*dt;
      if(t+1e-9>=nextFrame){const frame={t:nextFrame,x:targetAt(nextFrame,speed)};nextFrame+=cameraDt;if(mode==='fifo')queue.push(frame);else{dropped+=queue.length;queue=[frame]}maxQueue=Math.max(maxQueue,queue.length)}
      if(active&&t+1e-9>=busyUntil){lastAge=t-active.t;lastCommand=active.x+(mode==='predict'?speed*lastAge:0);processed++;active=null}
      if(!active&&queue.length){if(mode==='fifo')active=queue.shift();else{active=queue.pop();dropped+=queue.length;queue=[]}busyUntil=t+infer}
      const actual=targetAt(t,speed),error=Math.abs(lastCommand-actual);if(step%10===0)trace.push({t,actual,command:lastCommand,error,age:lastAge,queue:queue.length+(active?1:0)})
    }
    const final=trace[trace.length-1],errorMm=final.error*1000,ageMs=(active?duration-active.t:lastAge)*1000;
    return{mode,policy:QUEUE_MODES[mode],speed,inferMs:infer*1000,cameraHz:30,duration,trace,processed,dropped,maxQueue,ageMs,errorMm,success:errorMm<=40};
  }

  const TASKS={
    safety:{id:'safety',name:'защитная проверка',period:5,cost:1,deadline:5,color:'critical'},
    servo:{id:'servo',name:'сервоконтроллер',period:20,cost:2,deadline:20,color:'classic'},
    policy:{id:'policy',name:'VLA',period:200,cost:76,deadline:200,color:'e2e'},
  };
  function makeJobs(stall){const jobs=[];Object.values(TASKS).forEach(t=>{for(let at=0;at<1000;at+=t.period)jobs.push({task:t.id,at,cost:t.id==='policy'&&stall&&at===400?320:t.cost,deadline:at+t.deadline})});return jobs}
  function runLane(jobs,priority){
    const pending=jobs.slice().sort((a,b)=>a.at-b.at),done=[];let current=null,time=0;
    while(time<1000){
      if(!current){const ready=pending.filter(j=>j.at<=time);if(ready.length){ready.sort((a,b)=>priority.indexOf(a.task)-priority.indexOf(b.task)||a.at-b.at);current=ready[0];pending.splice(pending.indexOf(current),1);current.start=time;current.left=current.cost}}
      if(current){current.left--;if(current.left<=0){current.end=time+1;current.miss=current.end>current.deadline;done.push(current);current=null}}
      time++;
    }
    return done;
  }
  function schedulerSim(split,stall,watchdog){
    split=!!split;stall=!!stall;watchdog=!!watchdog;const jobs=makeJobs(stall),fast=jobs.filter(j=>j.task!=='policy'),slow=jobs.filter(j=>j.task==='policy');
    const done=split?runLane(fast,['safety','servo']).concat(runLane(slow,['policy'])):runLane(jobs,['safety','servo','policy']);
    const by={};Object.keys(TASKS).forEach(id=>{const xs=done.filter(j=>j.task===id);by[id]={total:xs.length,misses:xs.filter(j=>j.miss).length,maxLate:xs.reduce((m,j)=>Math.max(m,j.end-j.deadline),0)}});
    const policyEnds=done.filter(j=>j.task==='policy').map(j=>j.end).sort((a,b)=>a-b);let last=0,maxAge=0,stopAt=null;
    for(let t=0;t<1000;t++){while(policyEnds.length&&policyEnds[0]<=t)last=policyEnds.shift();const age=t-last;maxAge=Math.max(maxAge,age);if(watchdog&&stall&&stopAt==null&&age>250)stopAt=t}
    return{split,stall,watchdog,done,by,maxAge,stopAt,safe:by.safety.misses===0&&by.servo.misses===0,stopped:stopAt!=null};
  }

  const API={clamp,U,percentile,TOPOLOGIES,latencySample,latencyProfile,QUEUE_MODES,targetAt,queueSim,TASKS,schedulerSim};
  if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.L86=API;
})(typeof window!=='undefined'?window:globalThis);
