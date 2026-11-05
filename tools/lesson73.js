// Статические проверки урока 7.3: node tools/lesson73.js
// Общая браузерная проверка 7.3–7.4: node tools/lesson73-74-browser.js
const fs=require('fs'),path=require('path'),ROOT=path.resolve(__dirname,'..'),L=require('../lessons/l73/engine.js');
let fail=0,ok=0;function check(x,s){if(x){ok++;console.log('✓',s)}else{fail++;console.error('✗',s)}}
const ru=fs.readFileSync(path.join(ROOT,'lessons/l73/lesson.html'),'utf8'),en=fs.readFileSync(path.join(ROOT,'lessons/l73/lesson.en.html'),'utf8'),ui=fs.readFileSync(path.join(ROOT,'lessons/l73/ui-l73.js'),'utf8'),css=fs.readFileSync(path.join(ROOT,'lessons/l73/l73.css'),'utf8');
const X=L.models(),M=X.g.main,T=X.T;
check(T.D===4&&M.K===8&&M.A===2&&M.C===8,'вшиты токенизатор на 4 числа, словарь из 8 кодов и контекст 8 кадров');
const f=L.frameAt(.28,.34),z=L.encode(T,f),g=L.decode(T,z),d=L.detectCup(g);
check(z.every(Number.isFinite)&&d.ok,'кадр кодируется, восстанавливается и чашка остаётся видна');
const effects=[...Array(M.K)].map((_,k)=>L.buttonEffect(M,T,k));
check(effects.filter(e=>e.labels.length).length===8&&effects.filter(e=>!e.still).length>=6,'все кнопки можно подписать, не меньше шести двигают чашку');
check(effects.some(e=>e.still&&e.len<.025),'в словаре есть обнаружимый код паузы со сдвигом меньше 2,5 см');
check(effects.some(e=>e.dx>.03)&&effects.some(e=>e.dx<-.03)&&effects.some(e=>e.dy>.03)&&effects.some(e=>e.dy<-.03),'словарь покрывает четыре стороны');
check(effects.some(e=>e.labels.includes('u'))&&effects.some(e=>e.labels.includes('d')),'для смысловой миссии существует проверяемая противоположная пара «от Ады — к Аде»');
const ve=[4,8,16].map(K=>L.vocabError(M,T,K));
check(ve.every(Number.isFinite)&&ve[0]>ve[1]&&ve[1]>ve[2],`расширение словаря уменьшает ошибку одного шага: ${ve.map(x=>x.toFixed(3)).join(', ')}`);
let goal=L.playStart(T,[.40,.36]);for(const k of [7,7,4,4,4])L.playPress(M,T,goal,k);const gc=goal.cups.at(-1);
check(gc.ok&&Math.hypot(gc.x-L.GOAL[0],gc.y-L.GOAL[1])<.055,'чашку можно довести до блюдца только кодами скрытых действий');
const surv=[4,16,64,256].map(n=>L.adaSurvey(M,T,n).filter(x=>x.ok).length);
check(surv[0]===0&&surv[1]>=surv[0]&&surv[2]>=surv[1]&&surv[3]>surv[2],`размеченные пары помогают Аде: ${surv.join(', ')} успехов из 6`);
const v=L.videos({n:2,T:24,seed:4});check(v.length===2&&v.every(x=>x.frames.length===24&&x.acts.length===23),'неразмеченные ролики детерминированы и полны');
const choose=id=>effects.filter(e=>!e.still).sort((a,b)=>L.angDiff(a.ang,{r:0,u:-90}[id])-L.angDiff(b.ang,{r:0,u:-90}[id]))[0].k;
const right=choose('r'),up=choose('u'),stress=[
  L.runClip(M,T,{cup:[.20,.30],steps:[right,right,up,right]}),
  L.runClip(M,T,{cup:[.38,.16],steps:[right,right,right,right]}),
  L.runClip(M,T,{cup:[.67,.32],steps:[right,right,right,right]}),
  L.runClip(M,T,{cup:[.26,.40],steps:[right,'away','stay','stay','back',up]})
];
check(stress.map(x=>L.judge(x).type).join(',')==='none,through,edge,forgot','четыре миссии судьи дают ожидаемые исходы: знакомое, контакт, край, память');
const memory=[2,4,8].map(context=>{const q=L.runClip(M,T,{cup:[.26,.40],steps:[right,'away','stay','stay','back',up],context}),c=q.frames.at(-1).imag.cup;return[c.x,c.y]});
check(memory.flat().every(Number.isFinite)&&new Set(memory.map(x=>x.map(v=>v.toFixed(3)).join(','))).size===3,'свободный режим действительно меняет доступный контекст модели');
const ids=['film','filmCv','tokIn','tokOut','genieBars','codeMap','playCv','latentKeys','labelCompass','modelK','playMis','vocabStats','physicsBars','realCv','imagCv','clipCases','clipPlay','contextN','diagTree','clipMark','markRead','judgeMis','quizBox'];
check(ids.every(id=>ru.includes(`id="${id}"`)&&en.includes(`id="${id}"`)),'обе страницы содержат все узлы лабораторий');
check(![ru,en].some(s=>s.includes('<select'))&&[ru,en].every(s=>s.includes('class="compass"')&&s.includes('class="diagnosis"')&&(s.match(/class="seg small option-seg"/g)||[]).length===2),'в лабораториях нет выпадающих списков: направления выбираются компасом, ошибка — диагностикой, числа — сегментами');
check([ru,en].every(s=>s.includes('data-anim="genie"')&&s.includes('class="card stat-fig"')),'обе страницы содержат анимированную схему Genie и диаграммы из статей');
check(ui.indexOf('// Все маршруты рисуются первыми')>=0&&ui.indexOf('// Все маршруты рисуются первыми')<ui.indexOf('pairs.forEach((b, i) => pair'),'схема Genie рисует маршруты до карточек, а обучение словаря не дублирует лабораторию');
check([ru,en].every(s=>/<section class="section" id="quiz">\s*<div class="prose">/.test(s))&&ui.includes("className='card q-card'")&&ui.includes("className='q-opt'"),'квиз использует ту же узкую колонку и карточки, что уроки 7.1–7.2');
check([ru,en].every(s=>/<div class="lab">\s*<div class="card scene-card play-card">/.test(s)&&/<div class="lab lab-wide">\s*<div class="card scene-card judge-scene">/.test(s)&&(s.match(/<details class="deep">/g)||[]).length>=2),'обе лаборатории используют общую структуру scene-card + guide-card + «Под капотом»');
check(![ru,en].some(s=>s.includes('l73-lab')||s.includes('class="lab lab-wide judge"')),'у лабораторий нет локальной сетки поверх общего lab.css');
check(/\.keys\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/s.test(css)&&/\.keys button\s*\{[^}]*white-space: normal/s.test(css),'кнопки пульта переносят текст и не заходят под панель миссий');
check((ru.match(/<section /g)||[]).length>=9&&(en.match(/<section /g)||[]).length>=9,'в обеих версиях полный маршрут урока');
check(['control','engines','agent','limits'].every(id=>ru.includes(`id="${id}"`)&&en.includes(`id="${id}"`)),'маршрут включает способы управления, модель как среду, пользу для агента и пределы');
check(ru.includes('Genie 4')&&ru.includes('2025–2026')&&ru.includes('27 октября')&&en.includes('27 October'),'состояние на 29.10.2026 включает Genie 4');
check(ru.includes('arxiv.org/abs/2402.15391')&&ru.includes('arxiv.org/abs/2501.03575'),'первоисточники Genie и Cosmos указаны');
const tr=JSON.parse(fs.readFileSync(path.join(ROOT,'lessons/l73/i18n.en.json'),'utf8'));check(Object.keys(tr).length>=190&&!Object.values(tr).some(x=>!x),'все строки интерфейса переведены');
const gl=JSON.parse(fs.readFileSync(path.join(ROOT,'lessons/shared/glossary.json'),'utf8'));check(['video-tokenizer','latent-action','world-foundation-model'].every(id=>gl.some(x=>x.id===id&&x.l==='l73')),'три термина добавлены в глоссарий');
const lac=gl.find(x=>x.id==='latent-action');check(lac.t==='Код скрытого действия'&&lac.d.includes('Это не программный код')&&ru.includes('целое число от 0 до 7'),'код скрытого действия явно определён как индекс VQ-словаря, а не программа');
const tagSig=s=>[...s.matchAll(/<([a-z][\w-]*)([^>]*)>/gi)].map(m=>{const attrs=m[2].replace(/"[^"]*"|'[^']*'/g,'');return `${m[1]}:${[...attrs.matchAll(/\s([:\w-]+)(?=\s*=|\s|$)/g)].map(x=>x[1]).sort().join(',')}`}).join('|');
check(tagSig(ru)===tagSig(en),'русская и английская страницы структурно идентичны');
const paragraphCount=s=>(s.match(/<p(?:\s|>)/g)||[]).length;
check([ru,en].every(s=>paragraphCount(s)>=60&&paragraphCount(s)<=90),'число абзацев сопоставимо с уроками 7.1–7.2, текст не раздроблен на короткие блоки');
check(ru.includes('4-4-video-lyudey.html#actions')&&ru.includes('0-1-dve-paradigmy.html#ada'),'есть ссылки на повторённое понятие из 4.4 и представление Ады из 0.1');
check([ru,en].every(s=>s.includes('href="7-1-world-models-dreamer.html"'))&&![ru,en].some(s=>s.includes('href="7-1-modeli-mira.html"')),'ссылка на урок 7.1 ведёт на опубликованный адрес');
check(!ru.includes('модели работают в браузере')&&!ru.includes('Cosmos: не одна модель')&&!ru.includes('КРАСИВО — НЕ ЗНАЧИТ ВЕРНО'),'нет служебного чипа и шаблонных рекламных заголовков');
check(!/[А-Яа-яЁё]/.test(en.replace(/<script>[\s\S]*?<\/script>/g,'')),'в английском тексте нет кириллицы');
const words=s=>s.replace(/<script[\s\S]*?<\/script>/g,' ').replace(/<style[\s\S]*?<\/style>/g,' ').replace(/<[^>]+>/g,' ').split(/\s+/).filter(Boolean).length;
const neighborWords=['l71','l72'].map(id=>words(fs.readFileSync(path.join(ROOT,`lessons/${id}/lesson.html`),'utf8'))),ruMin=Math.ceil(.8*(neighborWords[0]+neighborWords[1])/2);
check(words(ru)>=ruMin&&words(en)>=words(ru),`русская версия не короче 80% медианы 7.1–7.2, английская передаёт весь объём: RU ${words(ru)}/${ruMin}, EN ${words(en)}`);
check(!/TODO|FIXME|модели не вшиты/.test(ru+en+ui),'в пользовательских материалах нет заглушек');
check(ui.includes('Найди код без заметного движения')&&ui.includes('Найди два противоположных действия')&&ui.includes("correct('u')")&&ui.includes("correct('d')")&&!ui.includes('seen===8')&&!ui.includes('Назови хотя бы шесть кнопок'),'миссии ищут существующую противоположную пару эффектов без обязательного перебора всего пульта');
console.log(`\n${ok} успешно, ${fail} ошибок`);process.exitCode=fail?1:0;
