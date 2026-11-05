// Финальная проверка новых страниц 8.7, 8.8 и проверки части 8.
'use strict';
const path=require('path'),fs=require('fs');
const{launch,sleep}=require('./cdp');
const E7=require('../lessons/l87/engine.js'),E8=require('../lessons/l88/engine.js');
const ROOT=path.resolve(__dirname,'..'),out=n=>path.join(ROOT,'shots',n),J=JSON.parse;
let bad=0;const check=(ok,msg)=>{if(!ok)bad++;console.log((ok?'  ✓ ':'  ✗ ')+msg)};
const text=(p,s)=>p.eval(`document.querySelector(${JSON.stringify(s)}).textContent.replace(/\s+/g,' ').trim()`);
async function shot(p,id,sel,name){await p.eval(`document.getElementById(${JSON.stringify(id)}).scrollIntoView({behavior:'instant'});true`);await sleep(180);await p.shotEl(out(name),sel,5)}
async function mission(p,sel,bet){return J(await p.eval(`(async()=>{const r=document.querySelector(${JSON.stringify(sel)}),bs=r.querySelectorAll('.m-bet .opts .btn');if(bs.length)bs[${bet||0}].click();const g=r.querySelector('.g-go');if(!g)throw Error('Нет кнопки запуска');g.click();for(let i=0;i<600&&r.classList.contains('m-busy');i++)await new Promise(x=>setTimeout(x,20));await new Promise(x=>setTimeout(x,80));return JSON.stringify({ok:[...r.querySelectorAll('.m-crit li')].every(x=>x.className==='ok'),out:(r.querySelector('.g-out:not([hidden])')||{}).textContent||''})})()`,true))}
function h2(l,sec){const s=fs.readFileSync(path.join(ROOT,'lessons','l'+l.replace('.',''),'lesson.html'),'utf8'),i=s.indexOf(`id="${sec}"`),e=s.indexOf('</section>',i),b=s.indexOf('<h2',i),z=s.indexOf('</h2>',b);return i>=0&&b<e?s.slice(s.indexOf('>',b)+1,z).replace(/<[^>]+>/g,'').trim():null}

check(E7.strategyScore('platform','factory').pass,'8.7: аппаратная платформа проходит складской сценарий');
check(E7.strategyScore('vertical','home').pass&&E7.strategyScore('open','lab').pass,'8.7: дом и лаборатория требуют разных стратегий');
check(E7.classify('bmw','pilot').correct&&E7.classify('gxo','repeat').correct,'8.7: лестница фактов сохраняет границы источников');
check(E7.scalePlan({integration:1,data:1,service:1}).pass&&!E7.scalePlan({integration:1,data:0,service:1}).pass,'8.7: парк масштабируется только с полным контуром');
const totes=E8.runCase('totes'),laundry=E8.runCase('laundry'),repair=E8.runCase('repair');
check(totes.pass&&totes.eligible&&!laundry.pass,'8.8: поток и утилизация меняют стоимость задачи');
check(!repair.eligible,'8.8: качество и безопасность останавливают ремонт до экономики');
check(E8.portfolio(['totes','machine','laundry','repair'],480000).pass,'8.8: портфель проходит обязательные проверки и бюджет');

(async()=>{const B=await launch({w:1360,h:1000});try{
  for(const cfg of[
    {id:'l87',file:'8-7-rynok-kompanii-strategii.html',anim:'market-stack',section:'strategies',lab:'#lab-strategy .lab'},
    {id:'l88',file:'8-8-ekonomika-vnedreniya.html',anim:'econ-stack',section:'tco',lab:'#lab-shift .lab'}]){
    const url='file://'+path.join(ROOT,'site/lessons',cfg.file),p=await B.page(url,{width:1280,height:1000,light:true});await p.waitFor('window.__lessonReady === true',30000);await sleep(350);
    check(await p.eval(`document.querySelectorAll('.lab').length`)===3,`${cfg.id}: три лаборатории`);
    check(await p.eval(`document.querySelectorAll('.scene-card').length===3&&document.querySelectorAll('.guide-card').length===3`),`${cfg.id}: общий каркас scene-card + guide-card`);
    check(await p.eval(`[...document.querySelectorAll('.scene-card')].every(x=>x.querySelector('.scene-toolbar, .evidence-board'))`),`${cfg.id}: управление находится рядом со сценой`);
    check(await p.eval(`document.querySelectorAll('.visual-legend').length===4&&[...document.querySelectorAll('.visual-legend')].every(x=>x.querySelectorAll('span').length>=3)`),`${cfg.id}: у схемы и трёх лабораторий есть видимые легенды`);
    if(cfg.id==='l87')check(await p.eval(`document.querySelectorAll('#players .company-row').length`)===5,'8.7: пять реальных предложений сравнены по ответственности и подтверждению');
    const g=J(await p.eval(`(()=>{const c=document.querySelector('canvas[data-anim="${cfg.anim}"]'),s=document.querySelector('#${cfg.section} .prose');return JSON.stringify({scroll:document.documentElement.scrollWidth,width:c.getBoundingClientRect().width,prose:s.getBoundingClientRect().width,layout:c.dataset.layout})})()`));
    check(g.scroll<=1280&&g.width>g.prose+200&&g.layout==='w',`${cfg.id}: полноширинная схема и нет горизонтальной прокрутки`);
    if(cfg.id==='l87'){
      await p.eval(`document.querySelector('#strategyCtl [data-v="platform"]').click();true`);
      check((await mission(p,'#strategyMis',0)).ok,'8.7: выбор стратегии проходит через интерфейс');
      await p.eval(`document.querySelector('#evidenceCtl [data-v="pilot"]').click();true`);
      check((await mission(p,'#evidenceMis',1)).ok,'8.7: лестница фактов проходит через интерфейс');
      await p.eval(`document.querySelector('#scaleCtl [value="integration"]').click();true`);
      check((await mission(p,'#scaleMis',0)).ok,'8.7: инвестиция в интеграцию проходит через интерфейс');
    }else{
      check((await mission(p,'#shiftMis',0)).ok,'8.8: месяц работы проходит через интерфейс');
      await p.eval(`(()=>{const x=document.querySelector('#calcCtl [data-k="utilization"]');x.value=75;x.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
      check((await mission(p,'#calcMis',0)).ok,'8.8: калькулятор порога проходит через интерфейс');
      check((await mission(p,'#portfolioMis',0)).ok,'8.8: портфель проходит через интерфейс');
    }
    await shot(p,cfg.section,`#${cfg.section} figure`,`${cfg.id}-flow.png`);
    if(cfg.id==='l87'){
      await shot(p,'players','#players .company-compare','l87-companies.png');
      await shot(p,'players','#players .company-cases','l87-company-cases.png');
      await shot(p,'lab-strategy','#lab-strategy .lab','l87-lab1.png');
      await shot(p,'lab-evidence','#lab-evidence .lab','l87-lab2.png');
      await shot(p,'lab-scale','#lab-scale .lab','l87-lab3.png');
    }else{
      await shot(p,'lab-shift','#lab-shift .lab','l88-lab1.png');
      await shot(p,'lab-calc','#lab-calc .lab','l88-lab2.png');
      await shot(p,'lab-portfolio','#lab-portfolio .lab','l88-lab3.png');
    }
    check(!p.logs.length,`${cfg.id}: консоль компьютера чистая${p.logs.length?' — '+p.logs.join(' | '):''}`);
    const m=await B.page(url,{width:390,height:844,dpr:2,mobile:true,dark:true});await m.waitFor('window.__lessonReady === true',30000);await sleep(280);
    check(await m.eval('document.documentElement.scrollWidth')<=390&&await m.eval(`[...document.querySelectorAll('.lab')].every(x=>x.scrollWidth<=x.clientWidth+1)`),`${cfg.id}: телефон 390 px без переполнения`);
    check(await m.eval(`document.querySelector('canvas[data-anim="${cfg.anim}"]').dataset.layout`)==='n',`${cfg.id}: отдельная мобильная раскладка схемы`);
    await shot(m,cfg.section,`#${cfg.section} figure`,`${cfg.id}-m-flow.png`);
    if(cfg.id==='l87'){
      await shot(m,'players','#players .company-compare','l87-m-companies.png');
      await shot(m,'lab-strategy','#lab-strategy .lab','l87-m-lab1.png');
      await shot(m,'lab-evidence','#lab-evidence .lab','l87-m-lab2.png');
      await shot(m,'lab-scale','#lab-scale .lab','l87-m-lab3.png');
    }else{
      await shot(m,'lab-shift','#lab-shift .lab','l88-m-lab1.png');
      await shot(m,'lab-calc','#lab-calc .lab','l88-m-lab2.png');
      await shot(m,'lab-portfolio','#lab-portfolio .lab','l88-m-lab3.png');
    }
    check(!m.logs.length,`${cfg.id}: консоль телефона чистая`);
    const rm=await B.page('about:blank',{width:900,height:720,light:true});
    await rm.S('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'},{name:'prefers-reduced-motion',value:'reduce'}]});
    await rm.S('Page.navigate',{url});await rm.waitFor('window.__lessonReady === true',30000);await sleep(220);
    const still=J(await rm.eval(`(async()=>{const c=document.querySelector('canvas[data-anim="${cfg.anim}"]'),a=c.toDataURL();await new Promise(r=>setTimeout(r,280));return JSON.stringify({same:a===c.toDataURL(),button:!!document.querySelector('.anim-play')})})()`,true));
    check(still.same&&still.button&&!rm.logs.length,`${cfg.id}: уменьшенное движение — статичный кадр и кнопка запуска`);
  }

  const url8='file://'+path.join(ROOT,'site/lessons/proverka-chasti-8.html'),p8=await B.page(url8,{width:1280,height:1000,light:true});await p8.waitFor('window.__c8Scene && window.__c8',30000);await sleep(250);
  check(await p8.eval('window.__c8.Q.length')===25&&await p8.eval('document.querySelectorAll(".chk-card").length')===25,'c8: 24 вопроса и одна живая задача');
  const per=J(await p8.eval('JSON.stringify(window.__c8.Q.reduce((a,q)=>(a[q.l]=(a[q.l]||0)+1,a),{}))'));
  check(Object.keys(per).length===8&&Object.values(per).every((n,i)=>n===(i===7?4:3)),'c8: по три вопроса на урок, сцена относится к 8.8');
  const links=J(await p8.eval('JSON.stringify(window.__c8.Q.slice(0,24).map(q=>[q.l,q.sec,q.st]))'));
  const miss=links.filter(([l,s,t])=>h2(l,s)!==t);check(!miss.length,'c8: ссылки ведут на точные разделы'+(miss.length?' — '+JSON.stringify(miss):''));
  await p8.eval('document.querySelector("#q25 .btn.primary").click();true');check(await p8.eval('window.__c8Scene.st.ran.pass')===false,'c8: слабая конфигурация останавливается на проверках');
  const best={control:'layered',safety:'filter',recovery:'managed',qa:'gates',bench:'contract',runtime:'split',deploy:'product',economy:'task'};
  for(const[k,v]of Object.entries(best))await p8.eval(`document.querySelector('#q25 [data-key="${k}"][data-v="${v}"]').click();true`);
  await p8.eval('document.querySelector("#q25 .btn.primary").click();true');await p8.waitFor('window.__c8.res[24] === true',10000);
  check(await p8.eval('window.__c8Scene.st.ran.gates')===8,'c8: полная конфигурация проходит восемь проверок');
  await shot(p8,'q25','#q25','c8-scene-success.png');check(await p8.eval('document.documentElement.scrollWidth')<=1280&&!p8.logs.length,'c8: компьютер без переполнения и ошибок');
  const m8=await B.page(url8,{width:390,height:844,dpr:2,mobile:true,dark:true});await m8.waitFor('window.__c8Scene',30000);await sleep(220);
  check(await m8.eval('document.documentElement.scrollWidth')<=390&&await m8.eval('[...document.querySelectorAll("#q25 .c8-gate")].every(x=>x.getBoundingClientRect().right<=document.querySelector("#q25").getBoundingClientRect().right+1)'),'c8: мобильная доска помещается в карточку');
  await shot(m8,'q25','#q25','c8-m-scene.png');check(!m8.logs.length,'c8: консоль телефона чистая');

  for(const width of[1024,768,720,640,360])for(const file of['8-7-rynok-kompanii-strategii.html','8-8-ekonomika-vnedreniya.html','proverka-chasti-8.html']){const q=await B.page('file://'+path.join(ROOT,'site/lessons',file),{width,height:900,mobile:width<=390,light:true});await q.waitFor(file.startsWith('proverka')?'window.__c8Scene':'window.__lessonReady === true',30000);check(await q.eval('document.documentElement.scrollWidth')<=width,`${file} · ${width}px: нет горизонтальной прокрутки`);check(!q.logs.length,`${file} · ${width}px: консоль чистая`)}
}finally{await B.close()}console.log(bad?`ИТОГ: ${bad} проверок не прошли`:'ИТОГ: все проверки прошли');process.exit(bad?1:0)})().catch(e=>{console.error(e);process.exit(1)});
