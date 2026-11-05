// Статические и численные проверки урока 7.5: node tools/lesson75.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const L = require('../lessons/l75/engine.js');
let ok = 0, fail = 0;
function check(value, message) {
  if (value) { ok++; console.log('✓', message); }
  else { fail++; console.error('✗', message); }
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const ru = read('lessons/l75/lesson.html');
const en = read('lessons/l75/lesson.en.html');
const ui = read('lessons/l75/ui-l75.js');
const css = read('lessons/l75/l75.css');
const engine = read('lessons/l75/engine.js');
const integration = read('lessons/l75/INTEGRATION.md');

const demo = L.exam({ rollouts: 0, failures: false });
const p2all = L.exam({ rollouts: 2, failures: true });
const p6all = L.exam({ rollouts: 6, failures: true });
const p6success = L.exam({ rollouts: 6, failures: false });
check(demo.bestModel === 'A' && demo.bestReal === 'D' && demo.rows.find((x) => x.id === 'A').realSuccess === 0, 'модель только на демонстрациях выбирает быстрый провальный чекпойнт A');
check(demo.metrics.spearman < 0 && demo.metrics.mmrv > .8, 'ловушка демонстраций даёт отрицательный Spearman и тяжёлое нарушение порядка');
check(p2all.metrics.spearman > demo.metrics.spearman && p2all.metrics.mmrv < demo.metrics.mmrv, 'два автономных прогона с неудачами улучшают порядок');
check(p6all.metrics.spearman >= .9 && p6all.metrics.mmrv <= .05, 'шесть прогонов с неудачами проходят пороги миссии');
check(p6success.metrics.spearman < .9 && p6success.metrics.mmrv > .05, 'одного покрытия успешными эпизодами недостаточно');
check(p6all.rows.every((x) => Number.isFinite(x.modelScore) && Number.isFinite(x.realSuccess) && x.real.n === 40 && x.real.runs.length === 40), 'восемь чекпойнтов исполняются на сорока настоящих стартах');

const info = L.MODEL_INFO;
check(info.training.demoEpisodes === 24 && info.training.demoTransitions === 1440 && info.training.policyBank === 20, 'обучение использует 24 демонстрации и банк из 20 политик');
check(info.training.policyEpisodes.p2 === 40 && info.training.policyEpisodes.p6 === 120 && info.training.failedEpisodes.p2 === 29 && info.training.failedEpisodes.p6 === 83, 'объёмы автономного опыта и неудач сохранены в весах');
check(Object.values(info.params).every((n) => n === 3183) && new Set(Object.values(info.hashes)).size === 5, 'пять разных ансамблей содержат по 3183 обученных параметра');
const probe = L.causalProbe('p6all');
check(probe.change > .1 && probe.before.some((x, i) => Math.abs(x - probe.after[i]) > .1), 'обнуление выходных весов причинно меняет оценки ансамбля');
check(!/bestModel\s*:\s*['"]|spearman\s*:\s*0\.|mmrv\s*:\s*0\./.test(engine), 'движок не содержит готовых ответов лаборатории');

const s1 = L.simulateScreen(1, 80, 75);
const s4 = L.simulateScreen(4, 80, 75);
const s20 = L.simulateScreen(20, 80, 75);
check(L.TRUE_BEST.id === 'P06' && !s1.top.includes('P06') && s4.top.includes('P06'), 'граница k = 4 впервые допускает настоящего лучшего P06');
check(s1.hitRate === 0 && s4.hitRate > s4.allRobotRate, 'узкий фильтр необратимо ошибается, а k = 4 обгоняет вариант без фильтра');
check(s20.trialsEach === 4 && s20.hitRate < s4.hitRate, 'при k = 20 на кандидата остаётся четыре попытки и шум выбора растёт');
check(JSON.stringify(L.simulateScreen(4, 80, 75)) === JSON.stringify(s4), '500 отборов воспроизводятся при одинаковом зерне');
check(L.metrics([3, 2, 1], [30, 20, 10]).spearman > .99 && L.mmrv([3, 1, 2], [30, 20, 10]) > 0, 'ранговые метрики вычисляются из переданных рядов');

const ids = ['evalFlow', 'veoBars', 'dreamgenBars', 'wmpoBars', 'examCv', 'examModelCv', 'examRealCv', 'rankModel', 'rankReal', 'examMetrics', 'examRead', 'rolloutCtl', 'failureCtl', 'judgeCtl', 'examMis', 'screenLive', 'screenCandidates', 'screenTableCv', 'screenCv', 'twoStageRate', 'allRobotRate', 'kCtl', 'budgetCtl', 'screenMis', 'quizBox'];
check(ids.every((id) => ru.includes(`id="${id}"`) && en.includes(`id="${id}"`)), 'обе страницы содержат все узлы диаграмм и лабораторий');
check(![ru, en].some((s) => s.includes('<select')), 'в уроке нет выпадающих списков');
check([ru, en].every((s) => (s.match(/<div class="lab lab-wide">/g) || []).length === 2 && (s.match(/<div class="lab-badge">/g) || []).length === 2 && (s.match(/<details class="deep">/g) || []).length === 3), 'две лаборатории используют общий каркас и заголовок курса, три технических пояснения раскрываются отдельно');
check([ru, en].every((s) => (s.match(/class="card stat-fig/g) || []).length === 6 && (s.match(/class="card stat-fig number-fig"/g) || []).length === 3 && s.includes('data-anim="evaluation"')), 'есть анимированная схема, три сопоставимые диаграммы и три числовые сводки другого типа');
check(!/costRollouts|costHours|costDaily|worldPearson|worldMmrv|studyBars/.test(ru + en + ui), 'несопоставимые единицы и разные исследования не показаны столбчатыми диаграммами');
check(ui.indexOf('// Сначала обратные связи и развилка') >= 0 && ui.indexOf('// Сначала обратные связи и развилка') < ui.indexOf("table(c, k, P, A, { x: 18"), 'стрелки анимации рисуются до карточек и остаются позади');
check(/\.section>\.wrap>\.prose[^}]*max-width:820px[^}]*margin-left:0/.test(css) && /\.section#quiz>\.prose[^}]*max-width:720px/.test(css) && !/\.section>\.wrap>\.(?:lab|flow-card)[^}]*max-width:820px/.test(css), 'текст выровнен как в соседних уроках, а лаборатории и анимация используют полную рабочую ширину');
check(/@media\(max-width:900px\)/.test(css) && /@media\(max-width:560px\)/.test(css), 'лаборатории имеют планшетную и телефонную раскладки');
check(ui.includes("scene: '#examCv'") && ui.includes("scene: '#screenLive'") && ui.includes("controls: ['rollouts', 'failures']") && ui.includes("controls: ['k']"), 'сцены и органы управления встроены в общий движок Missions');
check(!/onEnter:\s*\(\)\s*=>\s*\{[^}]*setRollouts\(6\)/.test(ui) && !/onEnter:\s*\(\)\s*=>\s*\{[^}]*setK\((?:4|20)\)/.test(ui), 'оцениваемые миссии не подставляют требуемые настройки автоматически');
check(ui.includes("revealed && x.id === result.best") && ui.includes("'настоящий лучший: скрыт до запуска'"), 'лаборатория 2 не раскрывает настоящего лучшего до запуска');

const tagSig = (s) => [...s.matchAll(/<([a-z][\w-]*)([^>]*)>/gi)].map((m) => {
  const attrs = m[2].replace(/"[^"]*"|'[^']*'/g, '');
  return `${m[1]}:${[...attrs.matchAll(/\s([:\w-]+)(?=\s*=|\s|$)/g)].map((x) => x[1]).sort().join(',')}`;
}).join('|');
check(tagSig(ru) === tagSig(en), 'русская и английская страницы структурно идентичны');
check(!/[А-Яа-яЁё]/.test(en), 'в английской странице нет кириллицы');
const words = (s) => s.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
const neighbor = ['l71', 'l72'].map((id) => words(read(`lessons/${id}/lesson.html`)));
const minWords = Math.ceil(.8 * (neighbor[0] + neighbor[1]) / 2);
check(words(ru) >= minWords && words(en) >= minWords, `обе версии не короче 80% среднего объёма 7.1–7.2: RU ${words(ru)}, EN ${words(en)}, минимум ${minWords}`);
const paragraphWords = (s) => [...s.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => words(m[1]));
const ruParagraphs = paragraphWords(ru), enParagraphs = paragraphWords(en), neighborParagraphs = ['l71', 'l72'].map((id) => paragraphWords(read(`lessons/${id}/lesson.html`)).length), neighborParagraphMean = (neighborParagraphs[0] + neighborParagraphs[1]) / 2;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
check([ruParagraphs, enParagraphs].every((xs) => xs.length >= .8 * neighborParagraphMean && xs.length <= 1.2 * neighborParagraphMean && mean(xs) >= 55), `абзацный ритм сопоставим с 7.1–7.2: RU ${ruParagraphs.length}/${mean(ruParagraphs).toFixed(1)}, EN ${enParagraphs.length}/${mean(enParagraphs).toFixed(1)}`);
check(['slow', 'loop', 'metrics', 'exam', 'works', 'bias', 'screen', 'data', 'rl', 'today', 'quiz', 'finale'].every((id) => ru.includes(`id="${id}"`) && en.includes(`id="${id}"`)), 'маршрут урока совпадает в обеих версиях');
check(ru.includes('\\(V^\\pi\\)') && ru.includes('\\(R_i\\)') && ru.includes('\\(k\\)') && !/\(V\^pi\)|\(R_i\)|\(S_i\)|\(k\) кандидат/.test(ru), 'формулы в русском тексте размечены для KaTeX');
check(ru.includes('5-1-osnovy-rl.html#value') && ru.includes('4-5-simulyatsiya.html#dreamgen') && ru.includes('4-4-video-lyudey.html#actions'), 'повторённые темы ведут на прошлые уроки');
check(ru.includes('8-1-klassika-v-konture.html') && en.includes('8-1-klassika-v-konture.html'), 'финальный мост ведёт к уроку 8.1');
check(['2405.05941', '2505.19017', '2512.10675', '2505.12705', '2511.11520'].every((id) => ru.includes(id) && en.includes(id)), 'ключевые утверждения ведут на первоисточники');
check(!/TODO|FIXME|заглушк/i.test(ru + en + ui + integration), 'в пользовательских материалах нет заглушек');

const dict = JSON.parse(read('lessons/l75/i18n.en.json'));
check(Object.keys(dict).length >= 180 && !Object.values(dict).some((x) => !x), 'все строки интерфейса имеют английские переводы');
const glRu = JSON.parse(read('lessons/shared/glossary.json'));
const glEn = JSON.parse(read('lessons/shared/glossary.en.json'));
check(['policy-testing', 'mmrv'].every((id) => glRu.some((x) => x.id === id && x.l === 'l75') && glEn.some((x) => x.id === id)), 'проверка политики и MMRV добавлены в обе версии глоссария');
check(fs.statSync(path.join(ROOT, 'lessons/l75/model-data.js')).size < 250 * 1024, 'встроенные веса не превышают лимит 250 КБ');
check(read('lessons/build.py').includes("'l75/model-data.js', 'l75/engine.js'"), 'сборщик подключает веса до движка урока');
check((integration.match(/"sec":/g) || []).length >= 5 && integration.includes('## Вопросы для проверки части 7'), 'для общей проверки части подготовлены вопросы PartCheck');

console.log(`\n${ok} успешно, ${fail} ошибок`);
process.exitCode = fail ? 1 : 0;
