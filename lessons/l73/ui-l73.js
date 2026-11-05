/* Урок 7.3: интерфейс двух лабораторий. */
'use strict';
(() => {
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)], L=window.L73;
  if(!L) return;
  let MM; try{MM=L.models()}catch(e){console.error(e);return} const T=MM.T,M=MM.g.main;
  function genieScheme() {
    const raw = [
      [[.22, .20], [.30, .20]],
      [[.31, .37], [.39, .37]],
      [[.57, .19], [.49, .19]],
    ];
    const samples = raw.map(([a, b]) => {
      const f0 = L.frameAt(a[0], a[1]), f1 = L.frameAt(b[0], b[1]);
      const code = L.codeOf(M, L.encode(T, f0), L.encode(T, f1));
      const S = L.playStart(T, a); L.playPress(M, T, S, code);
      const toCanvas = (f) => { const cv = document.createElement('canvas'); cv.width = cv.height = L.RES; frame(cv, f); return cv; };
      return { a: toCanvas(f0), b: toCanvas(f1), pred: toCanvas(S.frames.at(-1)), code };
    });

    function pair(c, P, A, b, sample, active) {
      A.rect(c, b.x, b.y, b.w, b.h, 9, active ? A.alpha(P.out, .08) : P.surf, active ? P.out : P.line, active ? 1.8 : 1);
      const h = b.h - 20, w = Math.min(h, (b.w - 56) / 2), y = b.y + 10;
      c.save(); c.imageSmoothingEnabled = false;
      c.drawImage(sample.a, b.x + 10, y, w, h);
      c.drawImage(sample.b, b.x + b.w - 10 - w, y, w, h);
      c.restore();
      A.arrow(c, b.x + 15 + w, b.y + b.h / 2, b.x + b.w - 15 - w, b.y + b.h / 2, P.out, 1.5, 5);
    }

    function vocabulary(c, k, P, A, b, selected) {
      A.rect(c, b.x, b.y, b.w, b.h, 10, P.surf, P.spr, 1.4);
      A.lab(c, k, 'словарь из 8 записей', b.x + 10, b.y + 18, { px: 10, weight: 800, color: P.spr, align: 'left', halo: false });
      const cellW = (b.w - 32) / 4;
      for (let i = 0; i < 8; i++) {
        const x = b.x + 10 + (i % 4) * ((b.w - 20) / 4), y = b.y + 38 + Math.floor(i / 4) * 44, on = i === selected;
        A.rect(c, x, y, cellW, 34, 6, on ? A.alpha(P.spr, .16) : P.surf2, on ? P.spr : P.line, on ? 2 : 1);
        A.lab(c, k, String(i), x + cellW / 2, y + 17, { px: 10, weight: 820, color: on ? P.spr : P.ink3, halo: false });
      }
    }

    function imageTile(c, k, P, A, cv, b, title, sub) {
      A.rect(c, b.x, b.y, b.w, b.h, 10, P.surf, P.mot, 1.8);
      A.lab(c, k, title, b.x + 10, b.y + 18, { px: 10, weight: 800, color: P.mot, align: 'left', halo: false });
      const top = b.y + 34, h = b.h - 64, w = Math.min(b.w - 20, h), x = b.x + (b.w - w) / 2;
      c.save(); c.imageSmoothingEnabled = false; c.drawImage(cv, x, top, w, h); c.restore();
      A.lab(c, k, sub, b.x + b.w / 2, b.y + b.h - 14, { px: 10, weight: 650, color: P.ink3, halo: false });
    }

    function moving(c, A, points, q, color) {
      A.line(c, points, color, 1.8);
      const lengths = [], total = points.slice(1).reduce((sum, p, i) => { const a = points[i], d = Math.hypot(p[0] - a[0], p[1] - a[1]); lengths.push(d); return sum + d; }, 0);
      let left = (((q % 1) + 1) % 1) * total;
      for (let i = 0; i < lengths.length; i++) {
        if (left <= lengths[i]) { const a = points[i], b = points[i + 1], u = lengths[i] ? left / lengths[i] : 0; A.circle(c, a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, 3.2, color); break; }
        left -= lengths[i];
      }
    }

    function draw(c, k, t, P, A, narrow) {
      c.fillStyle = P.surf2; c.fillRect(0, 0, narrow ? 360 : 760, narrow ? 715 : 430);
      const u = ((t % 9) + 9) % 9, active = Math.floor(u / 3), sample = samples[active], pulse = (u % 3) / 3;
      A.lab(c, k, narrow ? 'Видео → запись словаря → динамика' : 'Как видео без разметки превращается в словарь скрытых действий', narrow ? 180 : 380, 23, { px: narrow ? 11 : 13, weight: 820, color: P.ink, halo: false });

      if (!narrow) {
        const pairs = [55, 145, 235].map((y) => ({ x: 18, y, w: 245, h: 75 }));
        // Все маршруты рисуются первыми; карточки ниже перекрывают края линий.
        pairs.forEach((b, i) => A.line(c, [[b.x + b.w, b.y + b.h / 2], [280, b.y + b.h / 2], [280, 181]], i === active ? P.out : A.alpha(P.out, .28), i === active ? 1.8 : 1.2));
        A.arrow(c, 280, 181, 300, 181, P.out, 1.8, 6);
        A.arrow(c, 450, 181, 500, 181, P.spr, 1.8, 6);
        A.line(c, [[620, 245], [620, 270], [475, 270], [475, 342]], P.spr, 1.8);
        A.arrow(c, 475, 342, 470, 342, P.spr, 1.8, 6);
        A.arrow(c, 475, 342, 520, 342, P.mot, 1.8, 6);
        moving(c, A, [[263, pairs[active].y + 37.5], [280, pairs[active].y + 37.5], [280, 181], [300, 181]], pulse, P.out);
        moving(c, A, [[450, 181], [500, 181]], pulse + .35, P.spr);
        pairs.forEach((b, i) => pair(c, P, A, b, samples[i], i === active));
        A.rect(c, 300, 135, 150, 92, 10, A.alpha(P.out, .08), P.out, 1.5);
        A.lab(c, k, 'модель', 375, 164, { px: 11, weight: 820, color: P.out, halo: false });
        A.lab(c, k, 'скрытых действий', 375, 184, { px: 10.5, weight: 720, color: P.ink2, halo: false });
        A.lab(c, k, 'сравнивает переходы', 375, 207, { px: 10, color: P.ink3, halo: false });
        vocabulary(c, k, P, A, { x: 500, y: 95, w: 240, h: 150 }, sample.code);
        A.rect(c, 300, 300, 175, 84, 10, A.alpha(P.mot, .08), P.mot, 1.5);
        A.lab(c, k, 'модель динамики', 387.5, 329, { px: 11, weight: 820, color: P.mot, halo: false });
        A.lab(c, k, 'прошлое + запись', 387.5, 354, { px: 10, color: P.ink2, halo: false });
        imageTile(c, k, P, A, sample.pred, { x: 520, y: 285, w: 190, h: 125 }, 'предсказанный кадр', `использована запись ${sample.code}`);
        A.lab(c, k, 'Здесь показано обучение словаря; значения записей исследуются в лаборатории.', 18, 416, { px: 10, color: P.ink2, align: 'left', halo: false });
      } else {
        const pairs = [52, 132, 212].map((y) => ({ x: 12, y, w: 336, h: 66 }));
        pairs.forEach((b, i) => A.line(c, [[180, b.y + b.h], [180, 294]], i === active ? P.out : A.alpha(P.out, .24), i === active ? 1.7 : 1.1));
        A.arrow(c, 180, 294, 180, 310, P.out, 1.7, 6);
        A.arrow(c, 180, 374, 180, 397, P.spr, 1.7, 6);
        A.line(c, [[180, 545], [180, 565], [164, 565], [164, 610]], P.spr, 1.7);
        A.arrow(c, 164, 610, 154, 610, P.spr, 1.7, 6);
        A.arrow(c, 164, 610, 185, 610, P.mot, 1.7, 6);
        pairs.forEach((b, i) => pair(c, P, A, b, samples[i], i === active));
        A.rect(c, 60, 310, 240, 64, 9, A.alpha(P.out, .08), P.out, 1.4);
        A.lab(c, k, 'модель скрытых действий', 180, 342, { px: 10.5, weight: 800, color: P.out, halo: false });
        vocabulary(c, k, P, A, { x: 42, y: 397, w: 276, h: 148 }, sample.code);
        A.rect(c, 12, 575, 142, 72, 9, A.alpha(P.mot, .08), P.mot, 1.4);
        A.lab(c, k, 'модель динамики', 83, 601, { px: 10, weight: 800, color: P.mot, halo: false });
        A.lab(c, k, 'прошлое + запись', 83, 625, { px: 10, color: P.ink2, halo: false });
        imageTile(c, k, P, A, sample.pred, { x: 185, y: 555, w: 163, h: 142 }, 'следующий кадр', `запись ${sample.code}`);
      }
    }

    Anim.add('genie', {
      W: 760, H: 430, start: 1.1, narrowAt: 450,
      draw(c, k, t, P, A) { draw(c, k, t, P, A, false); },
      narrow: { W: 360, H: 715, draw(c, k, t, P, A) { draw(c, k, t, P, A, true); } },
    });
  }
  function charts(){
    StatsChart.bars($('#genieBars'),{series:[{id:'tokens',label:'модель скрытых действий по токенам',color:'var(--classic)'},{id:'pixels',label:'модель скрытых действий по пикселям',color:'var(--e2e)'}],groups:[{label:'Platformers',values:{tokens:1.33,pixels:1.91}},{label:'Robotics',values:{tokens:1.65,pixels:2.07}}],max:2.5,unit:'',ticks:[0,1,2],height:150,digits:2});
    StatsChart.bars($('#physicsBars'),{series:[{id:'physics',label:'Physics-IQ',color:'var(--classic)'},{id:'fake',label:'распознано сгенерированных видео',color:'var(--e2e)'}],groups:[{label:'VideoPoet · frames',values:{physics:29.5,fake:77.3}},{label:'Lumiere · frames',values:{physics:23,fake:86.9}},{label:'Runway Gen 3',values:{physics:22.8,fake:74.8}},{label:'VideoPoet · i2v',values:{physics:20.3,fake:85.4}},{label:'Lumiere · i2v',values:{physics:19,fake:79.8}},{label:'SVD',values:{physics:14.8,fake:81.3}},{label:'Pika 1.0',values:{physics:13,fake:80.5}},{label:'Sora',values:{physics:10,fake:55.6}}],max:100,unit:'%',ticks:[0,50,100],height:170,digits:1});
  }
  genieScheme();charts();
  function frame(cv,f){const c=cv.getContext('2d'),im=c.createImageData(L.RES,L.RES);for(let i=0;i<f.length;i++)im.data[(i/3|0)*4+i%3]=Math.max(0,Math.min(255,Math.round(f[i]*255)));for(let p=0;p<L.RES*L.RES;p++)im.data[p*4+3]=255;const tmp=document.createElement('canvas');tmp.width=tmp.height=L.RES;tmp.getContext('2d').putImageData(im,0,0);c.imageSmoothingEnabled=false;c.clearRect(0,0,cv.width,cv.height);c.drawImage(tmp,0,0,cv.width,cv.height)}
  function film(){const v=L.videos({n:1,T:12,seed:42})[0],cv=$('#filmCv');let at=0;function draw(){const c=cv.getContext('2d'),w=cv.width/4;c.clearRect(0,0,cv.width,cv.height);for(let q=0;q<4;q++){const i=Math.min(v.frames.length-1,at+q),tmp=document.createElement('canvas');tmp.width=tmp.height=L.RES;frame(tmp,v.frames[i]);c.imageSmoothingEnabled=false;c.drawImage(tmp,q*w,0,w,cv.height);c.fillStyle='rgba(0,0,0,.65)';c.fillRect(q*w+5,5,30,20);c.fillStyle='#fff';c.font='13px sans-serif';c.fillText(String(i+1),q*w+13,20)}$('#filmAt').textContent=`кадры ${at+1}–${Math.min(v.frames.length,at+4)}`};$('#filmPrev').onclick=()=>{at=Math.max(0,at-1);draw()};$('#filmNext').onclick=()=>{at=Math.min(v.frames.length-4,at+1);draw()};draw()}
  function tokens(){const f=L.frameAt(.28,.34),z=L.encode(T,f),g=L.decode(T,z);frame($('#tokIn'),f);frame($('#tokOut'),g);$('#tokNums').textContent='['+[...z].map(x=>x.toFixed(1).replace('.',',')).join('; ')+']'}
  const labelNames=Object.fromEntries(L.DIRS.map(x=>[x.id,`${x.arrow} ${x.name}`]));
  function lab1(){
    const keys=$('#latentKeys'),compass=$('#labelCompass'),models=Object.fromEntries([4,8,16].map(K=>[K,L.vocabVariant(M,T,K)]));
    let activeM=M,effects=[],S=L.playStart(T,[.34,.30]),selected=0,ctl=null;const seen=new Set(),labels=Array(M.K).fill(null);
    for(const id of ['ul','u','ur','l','none','r','dl','d','dr']){const d=L.DIRS.find(x=>x.id===id),b=document.createElement('button'),a=document.createElement('span');b.type='button';b.dataset.dir=id;b.setAttribute('aria-pressed','false');b.setAttribute('aria-label',d.name);b.title=d.name;a.className='compass-arrow';a.textContent=d.arrow;b.appendChild(a);if(id==='none'){const s=document.createElement('small');s.textContent='пауза';b.appendChild(s)}b.onclick=()=>{if(activeM.K!==8)return;labels[selected]=id;draw()};compass.appendChild(b)}
    function score(){const n=labels.filter(Boolean).length,R=L.checkLabels(M,T,labels),ok=R.filter(x=>x.label&&x.ok).length;return{n,ok,R}}
    function goalDist(){const c=S.cups.at(-1);return c.ok?Math.hypot(c.x-L.GOAL[0],c.y-L.GOAL[1]):Infinity}
    function state(){const q=score(),e=effects[selected],correct=id=>labels.some((d,k)=>d===id&&effects[k]&&effects[k].labels.includes(id));return{seen:seen.size,tried:seen.has(selected),selectedStill:!!(e&&e.still),selectedLen:e?e.len:Infinity,n:q.n,ok:q.ok,away:correct('u'),toward:correct('d'),selected,labels:labels.slice(),goal:goalDist()<.055,dist:goalDist(),steps:S.keys.length,K:activeM.K}}
    function buildKeys(){keys.innerHTML='';effects=[...Array(activeM.K)].map((_,k)=>L.buttonEffect(activeM,T,k));for(let k=0;k<activeM.K;k++){const b=document.createElement('button');b.type='button';b.className='btn';b.textContent=activeM.K===8&&labels[k]?`${k} · ${L.DIRS.find(x=>x.id===labels[k]).arrow}`:`код скрытого действия ${k}`;b.onclick=()=>{selected=k;if(activeM.K===8)seen.add(k);L.playPress(activeM,T,S,k);draw()};keys.appendChild(b)}}
    function setModel(K,start){activeM=models[K];selected=0;S=L.playStart(T,start||[.34,.30]);const cv=$('#codeMap');cv.height=K===16?360:230;buildKeys();draw()}
    function drawMap(){const cv=$('#codeMap'),c=cv.getContext('2d'),W=cv.width,H=cv.height,dark=document.documentElement.dataset.theme==='dark';c.clearRect(0,0,W,H);c.fillStyle=dark?'#1d1d1b':'#faf9f5';c.fillRect(0,0,W,H);const cols=4,rows=Math.ceil(activeM.K/cols),cw=W/cols,rh=H/rows;effects.forEach((e,k)=>{const x=(k%cols)*cw,y=Math.floor(k/cols)*rh,revealed=activeM.K!==8||seen.has(k),lab=activeM.K===8&&labels[k]?L.DIRS.find(d=>d.id===labels[k]).arrow:'?';c.strokeStyle=revealed?'#eb6834':(dark?'#5c5a55':'#d7d2c8');c.lineWidth=revealed?2.5:1.5;c.strokeRect(x+8,y+8,cw-16,rh-16);c.fillStyle=dark?'#f1efe9':'#24231f';c.font='700 13px sans-serif';c.fillText(`код ${k} · ${lab}`,x+16,y+27);const cx=x+cw/2,cy=y+Math.min(62,rh*.58);if(revealed){const len=Math.min(30,e.len*500);c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+Math.cos(e.ang*Math.PI/180)*len,cy+Math.sin(e.ang*Math.PI/180)*len);c.strokeStyle='#eb6834';c.lineWidth=4;c.stroke();c.beginPath();c.arc(cx,cy,4,0,Math.PI*2);c.fillStyle='#2a78d6';c.fill()}else{c.fillStyle=dark?'#77736f':'#aaa69d';c.font='700 25px sans-serif';c.textAlign='center';c.fillText('?',cx,cy+8);c.textAlign='left'}c.fillStyle=dark?'#aaa79e':'#77736a';c.font='11px sans-serif';c.fillText(revealed?`${Math.round(e.len*100)} см`:'проверь код',x+16,y+rh-17)});}
    function draw(){frame($('#playCv'),S.frames.at(-1));$('#playStep').textContent=`кадр ${S.frames.length-1}`;$$('#latentKeys button').forEach((b,i)=>b.classList.toggle('sel',i===selected));$$('#labelCompass button').forEach(b=>{b.disabled=activeM.K!==8;b.setAttribute('aria-pressed',String(activeM.K===8&&labels[selected]===b.dataset.dir))});$('#wrapLabels').classList.toggle('is-disabled',activeM.K!==8);$$('#modelK button').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.v===activeM.K)));const d=goalDist(),last=S.cups.length>1&&S.cups.at(-2).ok&&S.cups.at(-1).ok?Math.hypot(S.cups.at(-1).x-S.cups.at(-2).x,S.cups.at(-1).y-S.cups.at(-2).y):null;$('#playRead').textContent=`Нажатий: ${S.keys.length}. ${S.cups.at(-1).ok?`До блюдца: ${Math.round(d*100)} см.${last===null?'':` Последний сдвиг: ${Math.round(last*100)} см.`}`:'Модель потеряла чашку.'}`;const q=score();$('#codeMapRead').textContent=activeM.K===8?(q.n?`${q.n} подписано · ${q.ok} верно`:`Проверено кодов: ${seen.size}`):`словарь из ${activeM.K} кодов`;drawMap();if(ctl)ctl.update()}
    $('#playReset').onclick=()=>{S=L.playStart(T,ctl&&ctl.index===2?[.40,.36]:[.34,.30]);draw()};
    $('#modelK').onclick=e=>{const b=e.target.closest('button');if(b)setModel(+b.dataset.v,[.34,.30])};
    const missions=[
      {short:'Пауза',title:'Найди код без заметного движения',text:'Словарь может выделить не только направления толчка, но и паузу. Сначала поставь на устройство словаря, затем проверяй коды и найди тот, у которого средний сдвиг чашки из шести стартовых положений меньше 2,5 см. Оставь найденный код выбранным.',bet:{q:'Восемь кодов означают восемь равномерных направлений толчка?',options:['да, это задано устройством модели','нет, словарь сам делит наблюдавшиеся переходы и может выделить паузу или похожие направления','да, потому что код — команда моторам'],answer:()=>1},action:{label:'Проверить выбранный код',run:async()=>state()},criteria:[{label:'Выбранный код опробован',test:r=>!!r&&r.tried},{label:'Средний сдвиг чашки меньше 2,5 см',test:r=>!!r&&r.selectedStill}],hint:'Нажимай коды по одному. У кода паузы чашка почти не сместится, а стрелка в верхнем приборе будет самой короткой.',explain:r=>`Код ${r.selected} обозначает паузу: средний сдвиг чашки — ${Math.round(r.selectedLen*100)} см. Значит, восемь записей словаря не обязаны образовывать восемь направлений.`},
      {short:'Пара',title:'Найди два противоположных действия',text:'Для следующей задачи нужны две команды: одна должна сдвигать чашку от Ады, другая — к Аде. Проверяй коды из разных стартовых положений и подпиши только найденную пару. Миссия завершится сразу, как обе подписи окажутся устойчивыми.',controls:['labels'],criteria:[{label:'Найден код, который устойчиво сдвигает чашку от Ады',test:(r,s)=>s.away},{label:'Найден код, который устойчиво сдвигает чашку к Аде',test:(r,s)=>s.toward}],onEnter:()=>{if(activeM.K!==8)setModel(8)},hint:'Смотри на усреднённую стрелку в верхнем приборе. Длинная стрелка от Ады или к Аде должна сохранять направление из разных стартовых положений.',fail:()=>'',explain:()=>{const s=state();return `Нужная пара найдена после ${s.seen} проверенных кодов. Смысл кода находят по устойчивому эффекту, а не по его номеру; остальные записи словаря для этой цели перебирать не требуется.`}},
      {short:'Блюдце',title:'Доведи чашку до блюдца только кнопками',text:'Теперь пульт надо использовать, а не просто подписать. Чашка стартует рядом с центром стола. Нажимай найденные коды скрытых действий и остановись, когда до блюдца останется меньше 5,5 см.',onEnter:()=>setModel(8,[.40,.36]),criteria:[{label:'Чашка приблизилась к блюдцу меньше чем на 5,5 см',test:(r,s)=>s.goal},{label:'Использовано не больше двенадцати нажатий',test:(r,s)=>s.steps<=12}],hint:'Сначала найди код, который двигает вправо, затем поправь вертикальное положение.',explain:r=>`Цель достигнута за ${r.steps} нажатий. Пульт управляет продолжением кадра, но точность каждого шага зависит от того, какие переходы были в видео.`},
      {short:'Разметка',title:'Свяжи коды с действиями Ады',text:'Несколько переходов теперь размечены: известны кадр до, кадр после и настоящий толчок. По ним каждому коду назначается средний толчок, а простой планировщик каждый раз выбирает только кнопку, которая сейчас сильнее всего приближает чашку к блюдцу.',bet:{q:'Что будет при 4, 16, 64 и 256 размеченных парах?',options:['уже четырёх хватит для всех шести стартов','качество сначала вырастет, затем упрётся в ошибки модели мира и выбора следующей кнопки','чем больше пар, тем хуже: коды потеряют смысл'],answer:()=>1},action:{label:'Проверить четыре объёма разметки',run:async()=>{const N=[4,16,64,256],ok=N.map(n=>L.adaSurvey(M,T,n).filter(x=>x.ok).length);return{N,ok}}},criteria:[{label:'Проверены 4, 16, 64 и 256 пар',test:r=>!!r&&r.ok.length===4},{label:'При 64 парах успехов больше, чем при 4',test:r=>!!r&&r.ok[2]>r.ok[0]}],summary:r=>r.N.map((n,i)=>`${n}: ${r.ok[i]}/6`).join(' · '),explain:r=>`Получилось ${r.N.map((n,i)=>`${n} пар — ${r.ok[i]} из 6`).join(', ')}. Разметка связывает коды скрытых действий с приводами, но не исправляет продолжение и близорукий выбор только следующей кнопки.`},
      {short:'Словарь',final:true,title:'Свободный режим: сравни 4, 8 и 16 кодов',text:'Выбери размер словаря, начни с первого кадра и собери цепочку. Четыре кода сильнее смешивают разные переходы; шестнадцать уменьшают ошибку одного шага, но пульт становится труднее исследовать.',controls:'all',onEnter:()=>setModel(8,[.34,.30])}
    ];
    ctl=Missions.mount($('#playMis'),missions,{reset(){seen.clear();labels.fill(null);setModel(8,[.34,.30])},state},{controls:{labels:'#wrapLabels',model:'#wrapModel'},scene:'#codeMap'});setModel(8,[.34,.30]);App.on('theme',drawMap);
    const N=[4,16,64,256],box=$('#pairStats');N.forEach(n=>{const ok=L.adaSurvey(M,T,n).filter(x=>x.ok).length,d=document.createElement('div');d.innerHTML=`<b>${ok}/6</b><span>${n} размеченных пар</span>`;box.appendChild(d)});
    const vb=$('#vocabStats');[4,8,16].forEach(K=>{const d=document.createElement('div');d.innerHTML=`<b>${L.vocabError(M,T,K).toFixed(3).replace('.',',')}</b><span>${K} кодов · ошибка шага</span>`;vb.appendChild(d)})}
  function chooseCode(id){const effects=[...Array(M.K)].map((_,k)=>L.buttonEffect(M,T,k));const targets={r:0,l:180,u:-90,d:90};let best=0,bd=1e9;for(const e of effects){if(e.still)continue;const d=L.angDiff(e.ang,targets[id]);if(d<bd){bd=d;best=e.k}}return best}
  function lab2(){
    const code={r:chooseCode('r'),l:chooseCode('l'),u:chooseCode('u'),d:chooseCode('d')};const cases={clear:{cup:[.20,.30],steps:[code.r,code.r,code.u,code.r]},object:{cup:[.38,.16],steps:[code.r,code.r,code.r,code.r]},edge:{cup:[.67,.32],steps:[code.r,code.r,code.r,code.r]},memory:{cup:[.26,.40],steps:[code.r,'away','stay','stay','back',code.u]}};let clip,current='clear',timer=null,marked=null,context=8,diagNode='root',diagType=null,diagTrail=[];
    const names={none:'Пока существенного расхождения нет.',through:'Настоящая чашка упёрлась в предмет, воображаемая прошла дальше.',edge:'Настоящая чашка упала, модель оставила её на столе.',forgot:'После поворота модель не восстановила положение чашки.',vanish:'Воображаемая чашка исчезла.',drift:'Пути разошлись больше чем на 9 см.'};
    const diagNodes={root:{q:'Существенное расхождение уже видно?',no:'none',yes:'visible'},visible:{q:'Чашка видна в обоих кадрах?',no:'fallen',yes:'blocked'},fallen:{q:'Настоящая чашка уже упала со стола?',no:'vanish',yes:'edge'},blocked:{q:'Настоящая чашка остановилась у предмета?',no:'returned',yes:'through'},returned:{q:'Камера только что вернулась к столу?',no:'drift',yes:'forgot'}};
    function renderDiagnosis(){const box=$('#diagTree');box.innerHTML='';if(diagTrail.length){const ul=document.createElement('ul');ul.className='diag-trail';for(const x of diagTrail){const li=document.createElement('li');li.textContent=`${x.q} ${x.a}`;ul.appendChild(li)}box.appendChild(ul)}if(diagType){const p=document.createElement('p'),b=document.createElement('button');p.className='diag-result';p.innerHTML='<strong>Диагноз.</strong> ';p.append(names[diagType]);b.type='button';b.className='diag-reset';b.textContent='Изменить ответы';b.onclick=resetDiagnosis;box.append(p,b);$('#clipMark').disabled=false;return}const n=diagNodes[diagNode],q=document.createElement('p'),opts=document.createElement('div');q.className='diag-question';q.textContent=n.q;opts.className='diag-options';for(const yes of [false,true]){const b=document.createElement('button');b.type='button';b.className='btn';b.textContent=yes?'Да':'Нет';b.onclick=()=>{diagTrail.push({q:n.q,a:yes?'Да.':'Нет.'});const next=yes?n.yes:n.no;if(diagNodes[next])diagNode=next;else diagType=next;renderDiagnosis()};opts.appendChild(b)}box.append(q,opts);$('#clipMark').disabled=true}
    function resetDiagnosis(){diagNode='root';diagType=null;diagTrail=[];renderDiagnosis()}
    function load(name){current=name;marked=null;clip=L.runClip(M,T,{...cases[name],context});const r=$('#clipTime');r.max=clip.frames.length-1;r.value=0;$('#markRead').textContent='Отметки пока нет.';resetDiagnosis();draw();$$('#clipCases button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.case===name)));$$('#contextN button').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.v===context)))}
    function at(){return L.judge(clip)}
    function draw(){const i=+$('#clipTime').value,F=clip.frames[i];frame($('#realCv'),F.real.f);frame($('#imagCv'),F.imag.f);$('#clipAt').textContent=`${i+1} / ${clip.frames.length}`;$('#realState').textContent=!F.real.look?'Ада смотрит на плиту':!F.real.alive?'чашка упала':F.real.hitAny?'контакт':'на столе';$('#imagState').textContent=F.imag.cup.stove?'плита':F.imag.cup.ok?'чашка видна':'чашки нет';$('#judgeRead').textContent=`Кадр ${i+1} из ${clip.frames.length}. Сравни положение, контакт и видимость чашки.`}
    async function play(){if(timer)clearInterval(timer);resetDiagnosis();$('#clipTime').value=0;draw();return await new Promise(resolve=>{timer=setInterval(()=>{const r=$('#clipTime');if(+r.value>=+r.max){clearInterval(timer);timer=null;resolve();return}r.value=+r.value+1;draw()},320)})}
    function mark(){if(!diagType)return;marked={t:+$('#clipTime').value,type:diagType};$('#markRead').textContent=marked.type==='none'?`Отмечено: расхождения нет до кадра ${marked.t+1}.`:`Отмечено: кадр ${marked.t+1}, ${names[marked.type]}`}
    async function checkMark(){const truth=at(),ok=!!marked&&(truth.type==='none'?marked.type==='none'&&marked.t===clip.frames.length-1:marked.type===truth.type&&marked.t===truth.t);return{truth,marked:marked&&{...marked},ok,kind:current,n:clip.frames.length,context}}
    $('#clipTime').oninput=()=>{resetDiagnosis();draw()};$('#clipPlay').onclick=play;$('#clipMark').onclick=mark;$$('#clipCases button').forEach(b=>b.onclick=()=>load(b.dataset.case));$('#contextN').onclick=e=>{const b=e.target.closest('button');if(b){context=+b.dataset.v;load('memory')}};
    const act={label:'Проверить отметку',run:checkMark};const markedRight={label:'Первый неверный кадр и тип ошибки отмечены верно',test:r=>!!r&&r.ok};const missions=[
      {short:'Знакомое',title:'Калибровка на знакомом коротком пути',text:'Проиграй ролик, затем перемещай ползунок и сравни два мира кадр за кадром. Если существенного расхождения нет, пройди диагностику и отметь последний кадр.',onEnter:()=>load('clear'),bet:{q:'Появится ли существенное расхождение за четыре шага?',options:['нет: путь похож на обучающие записи','да: обязательно на первом кадре','да: чашка сразу упадёт'],answer:r=>r.truth.type==='none'?0:1},action:act,criteria:[markedRight],fail:()=>`Отметка не совпала. Вернись к началу и сравни положение чашки в каждом кадре.`,explain:()=>`На коротком знакомом пути расхождение осталось меньше порога 9 см. Это калибровка судьи, а не доказательство правильной физики.`},
      {short:'Контакт',title:'Найди первый неверный кадр при контакте',text:'В обучающих роликах чашку не толкали в предметы. Проиграй сцену, найди первый кадр, где настоящий и воображаемый пути физически расходятся, и пройди диагностику наблюдаемого сбоя.',onEnter:()=>load('object'),bet:{q:'Как нарушится физика?',options:['модель остановит чашку','воображаемая чашка пройдёт сквозь предмет','модель повернёт камеру'],answer:r=>r.truth.type==='through'?1:0},action:act,criteria:[markedRight],fail:()=>`Пока не совпало. Ищи первый кадр, где настоящий стол уже зарегистрировал контакт, а продолжение модели ещё движется.`,explain:r=>`Первый сбой — кадр ${r.truth.t+1}: настоящая чашка упёрлась, а модель продолжила знакомое движение. У видеомодели нет отдельного закона непроницаемости.`},
      {short:'Край',title:'Отметь кадр падения со стола',text:'В записях чашка всегда оставалась не ближе восьми сантиметров к краю. Здесь кнопки выводят её за эту границу. Найди первый кадр, где два мира расходятся.',onEnter:()=>load('edge'),bet:{q:'Что произойдёт после края?',options:['обе чашки упадут одинаково','настоящая упадёт, а модель оставит чашку на столе','обе остановятся у края'],answer:r=>r.truth.type==='edge'?1:0},action:act,criteria:[markedRight],fail:()=>`Сравни кадр, где на настоящем столе чашка впервые перестала существовать, с продолжением справа.`,explain:r=>`Первый сбой — кадр ${r.truth.t+1}. В данных не было падений, поэтому частое визуальное продолжение победило редкое опасное событие.`},
      {short:'Память',title:'Проверь постоянство невидимой чашки',text:'Ада отворачивается к плите, затем возвращается. Найди первый кадр после возврата, где модель неверно восстановила положение чашки.',onEnter:()=>load('memory'),bet:{q:'Сохранит ли модель положение скрытой чашки?',options:['обязательно: оно было в первом кадре','не обязательно: ограниченный контекст вытесняет стол','чашка всегда появляется в центре'],answer:r=>r.truth.type==='forgot'?1:0},action:act,criteria:[markedRight],fail:()=>`Ищи первый кадр после возвращения камеры к столу и сравни положение чашки слева и справа.`,explain:r=>`Первый сбой — кадр ${r.truth.t+1}. Картинка допустима, но история мира нарушена: это ошибка постоянства объекта.`},
      {short:'Свободно',final:true,title:'Свободный режим: контекст 2, 4 или 8 кадров',text:'Меняй доступный модели контекст, выбирай стресс-тест, проигрывай ролик и ставь собственную отметку. Более длинный контекст даёт больше истории, но не вводит отсутствующие физические законы.',controls:'all',action:act,summary:r=>`${current}, контекст ${context}: ${r.ok?'точно':'мимо'}`}
    ];
    Missions.mount($('#judgeMis'),missions,{reset(){context=8;load('clear')},state:()=>({kind:current,judge:at(),marked,diagnosis:diagType})},{controls:{cases:'#clipCases',context:'#contextCtl'},scene:'.duo'});load('clear')}
  const Q=[
    {q:'Зачем генеративной модели мира видеотокенизатор?',o:['Чтобы подписать действия','Чтобы сжать видео до токенов, на которых дешевле учить динамику','Только для показа'],a:1,e:'Токенизатор превращает пространственно-временные блоки видео в компактные коды. Модель динамики учится продолжать эти коды, а не каждый пиксель.'},
    {q:'Что получает модель скрытых действий Genie?',o:['Прошлые кадры и следующий кадр','Команду моторам','Текстовое описание'],a:0,e:'Во время обучения модель скрытых действий получает прошлые кадры и следующий кадр и выбирает код скрытого действия, который объясняет переход. Истинной команды в данных нет.'},
    {q:'Почему код скрытого действия ещё не команда роботу?',o:['Он слишком короткий','Он описывает изменение изображения, а не интерфейс конкретных приводов','Он всегда случаен'],a:1,e:'Код скрытого действия становится управляемой кнопкой для видеомодели, но связь с моторами конкретного тела появляется только после разметки или через известный интерфейс действий.'},
    {q:'Что доказывает фотореалистичное продолжение?',o:['Что физика верна','Что кадр правдоподобен; физику надо проверять отдельно','Что модель безопасна'],a:1,e:'Правдоподобный кадр может нарушать непроницаемость, край стола или постоянство объекта. Эти свойства проверяют отдельными событиями и метриками.'},
    {q:'Зачем несколько размеченных пар?',o:['Связать найденные коды скрытых действий с настоящими действиями','Улучшить экран','Изменить число токенов'],a:0,e:'Пары с известным действием назначают кодам скрытых действий команды конкретного агента. Они не исправляют саму модель продолжения.'},
    {q:'Где ошибка растёт быстрее всего?',o:['На знакомом коротком переходе','На длинной цепочке собственных предсказаний и вне данных','В первом настоящем кадре'],a:1,e:'Каждый сгенерированный кадр становится входом для следующего шага. Ошибки накапливаются, особенно в редких состояниях, которых не было в записях.'},
    {q:'Чем Cosmos отличается от одной готовой политики?',o:['Это платформа общих видеомоделей и инструментов, которые дообучают под задачу','Ничем','Cosmos не работает с видео'],a:0,e:'Cosmos объединяет токенизаторы, модели продолжения, обработку данных и рецепты дообучения. Политику или генератор для конкретного робота получают после адаптации.'},
    {q:'Что добавляет гибридный путь Genie 4?',o:['Отказ от генерации','Языковая модель удерживает план, а генеративная рисует непосредственное продолжение','Только больше пикселей'],a:1,e:'Gemini удерживает структуру сложного события и следит за ходом плана, а Genie отвечает за непосредственное аудиовизуальное продолжение мира.'}
  ];
  function quiz(){
    const perms=[[1,0,2],[0,2,1],[2,1,0],[0,1,2],[2,0,1],[1,2,0],[0,2,1],[2,1,0]],box=$('#quizBox');let answered=0,correct=0;
    Q.forEach((q,qi)=>{const card=document.createElement('div');card.className='card q-card';const h=document.createElement('h4'),qn=document.createElement('span'),qt=document.createElement('span');qn.className='qn';qn.textContent=`${qi+1}.`;qt.textContent=q.q;h.append(qn,qt);const opts=document.createElement('div'),exp=document.createElement('div'),pm=perms[qi%perms.length];opts.className='q-opts';exp.className='q-exp';exp.hidden=true;pm.forEach(oi=>{const b=document.createElement('button');b.type='button';b.className='q-opt';b.textContent=q.o[oi];b.onclick=()=>{if(card.dataset.done)return;card.dataset.done='1';const ok=oi===q.a;b.classList.add(ok?'correct':'incorrect');if(!ok)opts.children[pm.indexOf(q.a)].classList.add('correct');exp.innerHTML=`<strong>${ok?'Верно.':'Не совсем.'}</strong> ${q.e}`;exp.hidden=false;answered++;if(ok)correct++;$('#quizScore').textContent=answered===Q.length?`Итог: ${correct} из ${Q.length}. ${correct>=Q.length-2?'Отлично, можно идти дальше.':'Загляни ещё раз в разделы, где были ошибки.'}`:`Отвечено ${answered} из ${Q.length}`};opts.appendChild(b)});card.append(h,opts,exp);box.appendChild(card)});
  }
  film();tokens();lab1();lab2();quiz();
  window.__lessonReady = true;
})();
