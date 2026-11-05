// Статические проверки урока 7.4: node tools/lesson74.js
// Общая браузерная проверка 7.3–7.4: node tools/lesson73-74-browser.js
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.resolve(__dirname, '..'), L = require('../lessons/l74/engine.js');
let ok = 0, fail = 0; function check(x, s) { if (x) { ok++; console.log('✓', s); } else { fail++; console.error('✗', s); } }
const ru = fs.readFileSync(path.join(ROOT, 'lessons/l74/lesson.html'), 'utf8'), en = fs.readFileSync(path.join(ROOT, 'lessons/l74/lesson.en.html'), 'utf8'), ui = fs.readFileSync(path.join(ROOT, 'lessons/l74/ui-l74.js'), 'utf8'), css = fs.readFileSync(path.join(ROOT, 'lessons/l74/l74.css'), 'utf8');

const familiar = L.compare('familiar', 0, 0), detour0 = L.compare('detour', 0, 0), detour25 = L.compare('detour', 25, 0), shifted = L.compare('shifted', 25, 0);
const firstBias = L.minimumBias('detour', 25), detourBiased = L.compare('detour', 25, firstBias);
check(familiar.every((x) => x.success), 'на знакомом прямом пути все три контура достигают цели');
check(!detour0.find((x) => x.kind === 'vla').success && !detour0.find((x) => x.kind === 'wam').success, 'без человеческого видео VLA и WAM не знают обход');
check(!detour25.find((x) => x.kind === 'vla').success && detour25.find((x) => x.kind === 'open').success && detour25.find((x) => x.kind === 'wam').success, 'при одинаковых 25% видео оба контура одной WAM переносят обход, VLA — нет');
check(firstBias != null && !detourBiased.find((x) => x.kind === 'open').success && detourBiased.find((x) => x.kind === 'wam').success, 'при вычисленной ошибке привода одни веса и план различаются только обратной связью');
check(detour25.find((x) => x.kind === 'open').imag.every((v, i) => Math.abs(v - detour25.find((x) => x.kind === 'wam').imag[i]) < 1e-9), 'разомкнутый и замкнутый контуры WAM получают одинаковый предсказанный путь');
check(shifted.find((x) => x.kind === 'wam').success, 'WAM перестраивает путь после сдвига сахарницы');
check(detour25.every((x) => x.real.every(Number.isFinite) && x.imag.every(Number.isFinite)), 'все исполненные и воображаемые траектории конечны');
check(L.MODEL_INFO.robotDemos === 5 && L.MODEL_INFO.humanVideos === 12 && L.MODEL_INFO.transitions === 60 && L.MODEL_INFO.steps === 1200 && L.MODEL_INFO.inverseWeights.every(Number.isFinite) && L.MODEL_INFO.jointWeights.every(Number.isFinite), 'нейросетевые модели обучены на 60 переходах пяти траекторий, доступны двенадцать человеческих видео');
check(L.minimumShare('detour') === 25 && !L.run('open', 'detour', 0, 0).success && !L.run('wam', 'detour', 0, 0).success && L.run('open', 'detour', L.minimumShare('detour'), 0).success && L.run('wam', 'detour', L.minimumShare('detour'), 0).success, 'граница доли видео вычисляется исполнением одной WAM в двух контурах');
const idmProbe = L.causalProbe('idm'), wamProbe = L.causalProbe('wam'), futureProbe = L.causalProbe('wam-future');
check(idmProbe.commandChange > 50 && wamProbe.commandChange > 50 && futureProbe.commandChange > 10 && idmProbe.beforeSuccess && !idmProbe.afterSuccess && wamProbe.beforeSuccess && !wamProbe.afterSuccess, 'обнуление выходных весов и отдельно головы будущего причинно меняет команды обученных IDM и WAM');
check(L.CALIBRATION.every((x) => x.outcome === Number(x.rollout.success)) && new Set(L.CALIBRATION.map((x) => x.outcome)).size === 2, 'исходы калибровки получены из траекторий и содержат успехи и провалы');
const ideal = (pipe) => Object.fromEntries(L.CALIBRATION.filter((x) => x.pipe === pipe).map((x) => [x.id, x.outcome ? 90 : 10])), f1 = ideal('idm'), f2 = ideal('wam');
check(L.brier(Object.keys(f1), f1) < .05 && L.brier(Object.keys(f2), f2) < .05, 'калибровочные наборы имеют достижимую ошибку Брайера');
const noise = L.intervention(100, 'ordered', 'ood'), order = L.intervention(0, 'shuffled', 'ood');
check(noise.actionChange < 1 && noise.successDrop < 1, 'сильный содержательный шум меняет меньше 1% действий и почти не снижает успех');
check(order.actionChange > 2 && order.successDrop >= 24, 'перестановка кадров сильнее меняет действие и резко снижает успех вне распределения');
check(!/share\s*>=\s*25|successDrop\s*:\s*\d|actionChange\s*:\s*\d/.test(fs.readFileSync(path.join(ROOT, 'lessons/l74/engine.js'), 'utf8')), 'движок не содержит порога ответа или заранее заданных результатов лаборатории');
check(L.inference(false).latency < L.inference(true).latency && L.inference(false).success >= L.inference(true).success, 'отключение видео на инференсе ускоряет модель без потери успеха в учебном сравнении');

const ids = ['wamFlow', 'dreamBars', 'transferBars', 'fastSuccess', 'fastLatency', 'robustBars', 'compareCv', 'compareMetrics', 'scenarioCtl', 'shareCtl', 'biasCtl', 'manualRunWrap', 'compareRun', 'compareMis', 'calRows', 'calReset', 'interventionWrap', 'noiseCtl', 'orderCtl', 'domainCtl', 'interveneCv', 'trustMis', 'quizBox'];
check(ids.every((id) => ru.includes(`id="${id}"`) && en.includes(`id="${id}"`)), 'обе страницы содержат все узлы схемы, лабораторий и диаграмм');
check(![ru, en].some((s) => s.includes('<select')), 'в уроке нет выпадающих списков');
check([ru, en].every((s) => /<div class="lab lab-wide">\s*<div class="card scene-card/.test(s) && (s.match(/<details class="deep">/g) || []).length === 2), 'обе лаборатории используют общий каркас scene-card + guide-card и блоки «Под капотом»');
check(ui.includes("controls: ['share']") && ui.includes("controls: ['bias']") && ui.includes('sameFuture'), 'лаборатория 1 требует два парных эксперимента вместо просмотра заранее выставленных исходов');
check([ru, en].every((s) => /<section class="section" id="quiz">\s*<div class="prose">/.test(s)) && ui.includes("className = 'card q-card'") && ui.includes("className = 'q-opt'"), 'квиз остаётся в узкой колонке и использует общие карточки курса');
check([ru, en].every((s) => s.includes('data-anim="wam"') && (s.match(/class="card stat-fig"/g) || []).length === 4), 'есть анимированная схема архитектуры и четыре диаграммы по публикациям');
check(ui.indexOf('// Маршруты и маркеры рисуются до узлов') < ui.indexOf('thumb(c, P, A, obs, 0, P.out)'), 'в анимированной схеме стрелки рисуются до карточек и остаются позади');
check((ru.match(/<section /g) || []).length === (en.match(/<section /g) || []).length && (ru.match(/<section /g) || []).length >= 9, 'русский и английский маршруты урока равны');
const tagSig = (s) => [...s.matchAll(/<([a-z][\w-]*)([^>]*)>/gi)].map((m) => { const attrs = m[2].replace(/"[^"]*"|'[^']*'/g, ''); return `${m[1]}:${[...attrs.matchAll(/\s([:\w-]+)(?=\s*=|\s|$)/g)].map((x) => x[1]).sort().join(',')}`; }).join('|');
check(tagSig(ru) === tagSig(en), 'русская и английская страницы структурно идентичны');
const paragraphCount = (s) => (s.match(/<p(?:\s|>)/g) || []).length;
check([ru, en].every((s) => paragraphCount(s) >= 60 && paragraphCount(s) <= 90), 'число абзацев сопоставимо с уроками 7.1–7.2, текст не раздроблен на короткие блоки');
check(ru.includes('<h2>Восемь вопросов о World Action Models</h2>') && en.includes('<h2>Eight questions about World Action Models</h2>'), 'заголовок квиза использует общую форму курса');
check(!/[А-Яа-яЁё]/.test(en.replace(/<script>[\s\S]*?<\/script>/g, '')), 'в английском тексте нет кириллицы');
const words = (s) => s.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
const neighborWords = ['l71', 'l72'].map((id) => words(fs.readFileSync(path.join(ROOT, `lessons/${id}/lesson.html`), 'utf8'))), ruMin = Math.ceil(.8 * (neighborWords[0] + neighborWords[1]) / 2);
check(words(ru) >= ruMin && words(en) >= words(ru), `русская версия не короче 80% медианы 7.1–7.2, английская передаёт весь объём: RU ${words(ru)}/${ruMin}, EN ${words(en)}`);
check([ru, en].every((s) => ['gap', 'term', 'classes', 'three', 'dreamzero', 'video', 'trust', 'limits', 'today', 'quiz', 'finale'].every((id) => s.includes(`id="${id}"`))), 'маршрут следует брифу: термин, классы, две лаборатории, пределы и состояние темы разделены');
check(ru.includes('4-4-video-lyudey.html#actions') && ru.includes('0-1-dve-paradigmy.html#ada'), 'повторённые понятия ведут на прошлые уроки');
check(ru.includes('Урок 7.5 · Модели мира для проверки политик и генерации данных') && en.includes('Lesson 7.5 · World models for testing policies and generating data'), 'финальный мост использует утверждённое название урока 7.5');
check(ru.includes('arxiv.org/abs/2602.15922') && ru.includes('arxiv.org/abs/2603.16666') && ru.includes('arxiv.org/abs/2609.24048'), 'ключевые утверждения ведут на первоисточники');
check(!/TODO|FIXME|модели не вшиты/.test(ru + en + ui), 'в пользовательских материалах нет заглушек');
check(/\.cal-row\{[^}]*grid-template-columns/s.test(css) && /@media\(max-width:900px\)/.test(css) && ui.includes("document.createElement('canvas')") && ui.includes('drawCalThumb'), 'калибровка показывает последовательности кадров и имеет мобильную раскладку');
const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'lessons/l74/i18n.en.json'), 'utf8'));
check(Object.keys(dict).length >= 170 && !Object.values(dict).some((x) => !x), 'все строки интерфейса имеют английские переводы');
const gl = JSON.parse(fs.readFileSync(path.join(ROOT, 'lessons/shared/glossary.json'), 'utf8'));
check(['world-action-model', 'brier-score'].every((id) => gl.some((x) => x.id === id && x.l === 'l74')), 'World Action Model и ошибка Брайера добавлены в глоссарий');

console.log(`\n${ok} успешно, ${fail} ошибок`); process.exitCode = fail ? 1 : 0;
