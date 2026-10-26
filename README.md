# Modern Robotics and Physical AI · Modern Robotics и Physical AI

[English](#english) · [Русский](#modern-robotics-и-physical-ai)

## English

A free online course on modern robotics, from classical control and behavior cloning to vision-language-action models and humanoids. Every lesson is a self-contained HTML page with hands-on labs: small neural networks train right in the browser, with no server and nothing to install.

Course website: [modernrobotics.ru](https://modernrobotics.ru), in English at [modernrobotics.ru/en/](https://modernrobotics.ru/en/). Author: Oleg Shipitko.

### Course outline
The course has nine parts. A new part comes out on a Saturday; the website lists the lessons that are already out.

0. Introduction: the classical stack and its limits
1. Learning from demonstrations
2. Spatial representations, language and planning
3. Foundation models for robots
4. Data for training robots
5. Reinforcement learning
6. Humanoid robots
7. World models
8. From prototype to product

A part ends with a check: mixed questions on all its lessons and a task on a live scene.

### What's inside
```
site/        home page, changelog, privacy policy, 404 and config.json (links and lesson release dates)
  *.src.html, *.en.src.html            page sources in Russian and English
  changelog.json, changelog.en.json    "What's new": versions, dates and changes
  build.py                             builds site/ and site/en/ from the sources
  assets/                              styles, icons, photos, fonts, interactive hero scenes (assets/hero)
lessons/     course lessons
  build.py   builds every lesson into a self-contained HTML file: site/lessons/ in Russian and, with MR_LANG=en, site/en/lessons/
  lNM/       lesson N.M: lesson.html and lesson.en.html, styles, the lab engine and UI, i18n.en.json with the English JS strings
  cN/        the check at the end of part N
  shared/    common modules: canvas helpers (kit.js), lab missions (missions.js), card sorting (cards.js),
             animated diagrams (anim.js), bar charts of numbers from papers (stats-chart.js), glossary with first-mention hints (glossary.json, glossary.en.json),
             warm-up questions, progress, feedback, statistics, the "Say thanks" button,
             shared lab engines (Ada's home, the arm, the actuator model, MPC, Ada with legs)
server/      thanks/ — the "Say thanks" counter; stats/ — anonymous lesson statistics (Yandex Cloud Functions and YDB serverless)
tools/       headless Chrome tests with no external dependencies, Node scripts for tuning labs, release and deployment scripts
```

### Build and test
You need Python 3 and Node.js 18+; the tests also need Google Chrome.
```
python3 site/build.py                    # home page, changelog, privacy, 404, robots.txt and sitemap.xml in both languages
python3 lessons/build.py all --both      # all lessons in both languages → site/lessons/ and site/en/lessons/
MR_ASOF=2026-10-31 python3 lessons/build.py l51 --both   # a lesson as it will look on its release date
open site/index.html                     # everything works locally, without a server

node tools/lesson51.js                   # tests of lesson 5.1 (tools/lessonNM.js for lesson N.M)
node tools/check5.js                     # the part 5 check
node tools/en_pages.js                   # English pages: console, lang, language switch, hreflang, leftover Cyrillic
node tools/glossary_check.js             # glossary terms and hints
python3 tools/i18n_extract.py l51 --check   # every Russian string in the lesson's JS has an English translation
tools/deploy.sh --dryrun                 # what a deployment would upload
```

### How the lessons work
- Labs are missions on a live scene. Each mission has a goal with a ✓/✗ check, a bet on the outcome, a hint and a debrief; controls unlock mission by mission, and a free mode comes at the end.
- The models in the labs are real and deterministic. The random seed is fixed, so the explanations match what the reader sees. Many lab engines avoid the browser's built-in math functions, so Chrome, Safari and Node produce the same numbers.
- After changing a lab engine, re-check the effects in Node and on several seeds: the parameters are tuned so that the experiments give a stable result.
- A lesson opens with a short warm-up on the previous lesson and ends with a bridge: what the method runs into and which lesson solves that problem.
- Color meanings: classical methods are blue `#2a78d6`, neural networks orange `#eb6834`, hybrids purple `#4a3aa7`.
- Facts and numbers are checked against the original papers before a lesson is published.

### English version
- The English mirror lives under `/en/` with the same file names. A lesson's English text is `lNM/lesson.en.html`; the strings in its JS are translated in `lNM/i18n.en.json`, where the key is the Russian string literal.
- `MR_LANG=en python3 lessons/build.py lNM --strict` fails if anything is left untranslated.

### Publishing
- `site/config.json` → `PUBLISHED` lists the lessons with their release dates. A lesson appears on the home page, in the sitemap and in the deployment on its date, Moscow time.
- `tools/deploy.sh` builds everything into `dist/` and syncs it with the `modernrobotics.ru` bucket through the AWS CLI (profile `mr`, endpoint `storage.yandexcloud.net`). Flags: `--build-only`, `--dryrun`. `tools/release_mac.sh` schedules a Saturday release from a Mac.
- The cloud is set up with `yc` by `tools/cloud-setup.sh`: site and www buckets, the DNS zone, a Let's Encrypt certificate, HTTPS and a deployment key (steps `buckets`, `dns`, `cert`, `https`, `deploy-key`, `status`).
- The Inter and JetBrains Mono fonts are self-hosted in `site/assets/fonts/` (SIL Open Font License).
- The link preview image `site/assets/og.png` is drawn by `node tools/og_image.js`.
- The "Say thanks" button shows a shared counter kept by a Yandex Cloud function (`server/thanks/deploy.sh`); the database holds only the number. Lessons send anonymous events, such as page opens, how far the reader got and mission results, to `server/stats/`. It stores daily sums per page and the texts of end-of-lesson feedback, with no cookies and no reader identifiers; the privacy policy on the website lists what is counted.

### Licenses
- Code: [MIT](LICENSE).
- Lesson texts and illustrations: [CC BY-NC 4.0](LICENSE-CONTENT). You may quote, translate and use them in teaching with a link to the course, but not for commercial purposes.

## Modern Robotics и Physical AI

Бесплатный онлайн-курс о современной робототехнике: от классического управления и behavior cloning до моделей зрения, языка и действий (VLA) и гуманоидов. Каждый урок — самодостаточная HTML-страница с лабораторными работами: небольшие нейросети обучаются прямо в браузере, без сервера и без установки.

Сайт курса: [modernrobotics.ru](https://modernrobotics.ru), английская версия — [modernrobotics.ru/en/](https://modernrobotics.ru/en/). Автор — Олег Шипитько.

### Программа
В курсе девять частей. Новая часть выходит в субботу; на сайте отмечены уроки, которые уже вышли.

0. Введение: классический стек и его пределы
1. Обучение по демонстрациям
2. Пространственные представления, язык и планирование
3. Foundation-модели для роботов
4. Данные для обучения роботов
5. Обучение с подкреплением
6. Гуманоидные роботы
7. Модели мира
8. От прототипа к продукту

В конце части стоит проверка: вопросы вперемешку по всем её урокам и задача на живой сцене.

### Что внутри
```
site/        главная, «Что нового», политика конфиденциальности, 404 и config.json (ссылки и даты выхода уроков)
  *.src.html, *.en.src.html            исходники страниц на русском и английском
  changelog.json, changelog.en.json    «Что нового»: версии, даты и изменения
  build.py                             сборка site/ и site/en/ из исходников
  assets/                              стили, иконки, фото, шрифты, интерактивы первого экрана (assets/hero)
lessons/     уроки курса
  build.py   сборка каждого урока в самодостаточный HTML-файл: site/lessons/ по-русски, а с MR_LANG=en — site/en/lessons/
  lNM/       урок N.M: lesson.html и lesson.en.html, стили, движок и интерфейс лабораторий, i18n.en.json с английскими строками JS
  cN/        проверка в конце части N
  shared/    общие модули: канвас и подписи (kit.js), миссии лабораторий (missions.js), сортировка карточек (cards.js),
             анимированные схемы (anim.js), диаграммы чисел из статей (stats-chart.js), глоссарий с подсказками к первому упоминанию (glossary.json, glossary.en.json),
             разминка, прогресс, отзыв, статистика, кнопка «Сказать спасибо»,
             общие движки лабораторий (дом Ады, рука, модель привода, MPC, Ада с ногами)
server/      thanks/ — счётчик «Сказать спасибо»; stats/ — анонимная статистика уроков (Yandex Cloud Functions и YDB serverless)
tools/       проверки в headless Chrome без внешних зависимостей, скрипты Node для подбора параметров лабораторий, выпуск и выкладка
```

### Сборка и проверка
Нужны Python 3 и Node.js 18+; для проверок — Google Chrome.
```
python3 site/build.py                    # главная, «Что нового», политика, 404, robots.txt и sitemap.xml на двух языках
python3 lessons/build.py all --both      # все уроки на двух языках → site/lessons/ и site/en/lessons/
MR_ASOF=2026-10-31 python3 lessons/build.py l51 --both   # урок таким, каким он будет в день выхода
open site/index.html                     # всё работает локально, без сервера

node tools/lesson51.js                   # проверки урока 5.1 (tools/lessonNM.js для урока N.M)
node tools/check5.js                     # проверка части 5
node tools/en_pages.js                   # английские страницы: консоль, lang, переключатель, hreflang, остатки кириллицы
node tools/glossary_check.js             # термины глоссария и подсказки
python3 tools/i18n_extract.py l51 --check   # у каждой русской строки в JS урока есть английский перевод
tools/deploy.sh --dryrun                 # что уйдёт на сайт при выкладке
```

### Как устроены уроки
- Лаборатории — миссии на живой сцене. У каждой миссии цель с проверкой ✓/✗, ставка на исход, подсказка и разбор; ручки появляются по мере миссий, в конце — свободный режим.
- Модели в лабораториях настоящие и детерминированные. Зерно случайности фиксировано, поэтому тексты объяснений совпадают с тем, что видит читатель. Многие движки лабораторий не опираются на встроенную математику браузера, поэтому Chrome, Safari и Node дают одни и те же числа.
- После правок движка лаборатории перепроверяй эффекты в Node и на нескольких зёрнах: параметры подобраны так, чтобы опыты давали устойчивый результат.
- Урок начинается с короткой разминки по прошлому уроку и заканчивается мостом: во что упирается метод и какой урок решает эту проблему.
- Цвета смыслов: классические методы — синий `#2a78d6`, нейросети — оранжевый `#eb6834`, гибриды — фиолетовый `#4a3aa7`.
- Факты и цифры сверяются с первоисточниками перед публикацией урока.

### Английская версия
- Английское зеркало лежит под `/en/` с теми же именами файлов. Английский текст урока — `lNM/lesson.en.html`; строки из его JS переведены в `lNM/i18n.en.json`, где ключ — русская строка-литерал.
- `MR_LANG=en python3 lessons/build.py lNM --strict` падает, если что-то осталось без перевода.

### Публикация
- `site/config.json` → `PUBLISHED` перечисляет уроки с датами выхода. Урок появляется на главной, в sitemap и в выкладке в свой день по Москве.
- `tools/deploy.sh` собирает всё в `dist/` и синхронизирует с бакетом `modernrobotics.ru` через AWS CLI (профиль `mr`, endpoint `storage.yandexcloud.net`). Флаги: `--build-only`, `--dryrun`. `tools/release_mac.sh` ставит субботний выпуск по расписанию с Mac.
- Облако настраивается через `yc` скриптом `tools/cloud-setup.sh`: бакеты сайта и www, зона DNS, сертификат Let's Encrypt, HTTPS и ключ для выкладки (шаги `buckets`, `dns`, `cert`, `https`, `deploy-key`, `status`).
- Шрифты Inter и JetBrains Mono лежат на своём сервере: `site/assets/fonts/` (SIL Open Font License).
- Картинку превью ссылок `site/assets/og.png` рисует скрипт `node tools/og_image.js`.
- Кнопка «Сказать спасибо» показывает общий счётчик. Его хранит функция в Yandex Cloud (`server/thanks/deploy.sh`), в базе только число. Уроки отправляют в `server/stats/` анонимные события: открытие страницы, до какого раздела дочитали, итоги миссий. Там хранятся суммы по дням и страницам и тексты отзывов в конце урока, без cookies и без идентификаторов читателей; что именно считается, перечислено в политике конфиденциальности на сайте.

### Лицензии
- Код — [MIT](LICENSE).
- Тексты уроков и иллюстрации — [CC BY-NC 4.0](LICENSE-CONTENT): можно цитировать, переводить и использовать в обучении со ссылкой на курс, но не в коммерческих целях.
