# Modern Robotics and Physical AI

**English** · [Русский](README.ru.md)

A free online course on modern robotics, from classical control and behavior cloning to vision-language-action models and humanoids. Every lesson is a self-contained HTML page with hands-on labs: small neural networks train right in the browser, with no server and nothing to install.

Course website: [modernrobotics.ru](https://modernrobotics.ru), in English at [modernrobotics.ru/en/](https://modernrobotics.ru/en/). Author: Oleg Shipitko.

## Course outline
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

## What's inside
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
             animated diagrams (anim.js), glossary with first-mention hints (glossary.json, glossary.en.json),
             warm-up questions, progress, feedback, statistics, the "Say thanks" button,
             shared lab engines (Ada's home, the arm, the actuator model, MPC, Ada with legs)
server/      thanks/ — the "Say thanks" counter; stats/ — anonymous lesson statistics (Yandex Cloud Functions and YDB serverless)
tools/       headless Chrome tests with no external dependencies, Node scripts for tuning labs, release and deployment scripts
```

## Build and test
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

## How the lessons work
- Labs are missions on a live scene. Each mission has a goal with a ✓/✗ check, a bet on the outcome, a hint and a debrief; controls unlock mission by mission, and a free mode comes at the end.
- The models in the labs are real and deterministic. The random seed is fixed, so the explanations match what the reader sees. Many lab engines avoid the browser's built-in math functions, so Chrome, Safari and Node produce the same numbers.
- After changing a lab engine, re-check the effects in Node and on several seeds: the parameters are tuned so that the experiments give a stable result.
- A lesson opens with a short warm-up on the previous lesson and ends with a bridge: what the method runs into and which lesson solves that problem.
- Color meanings: classical methods are blue `#2a78d6`, neural networks orange `#eb6834`, hybrids purple `#4a3aa7`.
- Facts and numbers are checked against the original papers before a lesson is published.

## English version
- The English mirror lives under `/en/` with the same file names. A lesson's English text is `lNM/lesson.en.html`; the strings in its JS are translated in `lNM/i18n.en.json`, where the key is the Russian string literal.
- `MR_LANG=en python3 lessons/build.py lNM --strict` fails if anything is left untranslated.

## Publishing
- `site/config.json` → `PUBLISHED` lists the lessons with their release dates. A lesson appears on the home page, in the sitemap and in the deployment on its date, Moscow time.
- `tools/deploy.sh` builds everything into `dist/` and syncs it with the `modernrobotics.ru` bucket through the AWS CLI (profile `mr`, endpoint `storage.yandexcloud.net`). Flags: `--build-only`, `--dryrun`. `tools/release_mac.sh` schedules a Saturday release from a Mac.
- The cloud is set up with `yc` by `tools/cloud-setup.sh`: site and www buckets, the DNS zone, a Let's Encrypt certificate, HTTPS and a deployment key (steps `buckets`, `dns`, `cert`, `https`, `deploy-key`, `status`).
- The Inter and JetBrains Mono fonts are self-hosted in `site/assets/fonts/` (SIL Open Font License).
- The link preview image `site/assets/og.png` is drawn by `node tools/og_image.js`.
- The "Say thanks" button shows a shared counter kept by a Yandex Cloud function (`server/thanks/deploy.sh`); the database holds only the number. Lessons send anonymous events, such as page opens, how far the reader got and mission results, to `server/stats/`. It stores daily sums per page and the texts of end-of-lesson feedback, with no cookies and no reader identifiers; the privacy policy on the website lists what is counted.

## Licenses
- Code: [MIT](LICENSE).
- Lesson texts and illustrations: [CC BY-NC 4.0](LICENSE-CONTENT). You may quote, translate and use them in teaching with a link to the course, but not for commercial purposes.
