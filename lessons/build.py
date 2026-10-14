#!/usr/bin/env python3
"""Собирает урок в один самодостаточный HTML-файл.
Запуск: python3 lessons/build.py l01   (или l11, или all)
Результат — в site/lessons/. MR_ASOF=ГГГГ-ММ-ДД — собрать уроки такими, какими они станут
в день выпуска (ссылки на страницы, которые выходят в этот день; см. site/published.py).
Английская версия (sources/i18n-spec.md): MR_LANG=en python3 lessons/build.py l01 — читает lXX/lesson.en.html,
к JS применяет словари i18n.en.json (папки каждого подключённого файла, shared и самого урока), глоссарий —
из shared/glossary.en.json, результат — в site/en/lessons/. Урок без lesson.en.html по-английски не собирается.
  python3 lessons/build.py l01 --both     обе версии (all --both — все уроки на обоих языках)
  MR_LANG=en python3 lessons/build.py l01 --strict   упасть, если в JS остались литералы с кириллицей
"""
import os, pathlib, subprocess, sys
root = pathlib.Path(__file__).resolve().parent
LESSONS = {
    # урок: (файл, css-файлы, {маркер: js-файлы})
    'l01': ('0-1-dve-paradigmy.html', ['l01/lesson.css'], {
        '/*@@SIM@@*/': ['l01/sim.js'],
        '/*@@UI@@*/': ['l01/ui-core.js', 'l01/ui-scene.js', 'l01/ui-lab1.js', 'l01/ui-lab2.js', 'l01/ui-labs.js', 'l01/ui-extras.js', 'l01/ui-main.js'],
    }),
    'l02': ('0-2-ustroystvo-robota.html', ['l01/lesson.css', 'shared/lab.css', 'l02/l02.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/actuator-core.js', 'l02/engine-l02.js', 'shared/missions.js', 'shared/cards.js', 'l02/actuators.js', 'shared/anim.js', 'l02/sensors.js', 'l02/ui-l02.js'],
    }),
    'l03': ('0-3-kinematika-i-upravlenie.html', ['l01/lesson.css', 'shared/lab.css', 'l03/l03.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/arm-core.js', 'shared/mpc-core.js', 'shared/missions.js', 'shared/cards.js', 'l03/ui-l03.js'],
    }),
    'l11': ('1-1-behavior-cloning.html', ['l01/lesson.css', 'shared/lab.css', 'l11/l11.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/drive-core.js', 'shared/drive-lab.js', 'shared/missions.js', 'shared/cards.js', 'l11/ui-l11.js'],
    }),
    'l12': ('1-2-dagger.html', ['l01/lesson.css', 'shared/lab.css', 'l12/l12.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/drive-core.js', 'shared/drive-lab.js', 'shared/missions.js', 'shared/cards.js', 'l12/ui-l12.js'],
    }),
    'l04': ('0-4-otsenka-sostoyaniya-i-planirovanie.html', ['l01/lesson.css', 'shared/lab.css', 'l04/l04.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'l04/engine.js', 'l04/data-l04.js', 'l04/ui-l04.js'],
    }),
    'l13': ('1-3-multimodalnost-deystviy.html', ['l01/lesson.css', 'shared/lab.css', 'l13/l13.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/kettle-core.js', 'shared/kettle-draw.js', 'shared/missions.js', 'shared/cards.js', 'shared/anim.js', 'l13/modes.js', 'l13/ui-l13.js'],
    }),
    'l14': ('1-4-diffuzionnye-modeli.html', ['l01/lesson.css', 'shared/lab.css', 'l14/l14.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'shared/anim.js', 'l14/engine.js', 'l14/ui-l14.js'],
    }),
    'l15': ('1-5-diffusion-policy.html', ['l01/lesson.css', 'shared/lab.css', 'l15/l15.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/kettle-core.js', 'shared/kettle-draw.js', 'shared/missions.js', 'shared/cards.js', 'shared/anim.js', 'l15/engine.js', 'l15/ui-l15.js'],
    }),
    'l16': ('1-6-transformer.html', ['l01/lesson.css', 'shared/lab.css', 'l16/l16.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'l16/engine.js', 'l16/ui-l16.js'],
    }),
    'l17': ('1-7-act.html', ['l01/lesson.css', 'shared/lab.css', 'l17/l17.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'l17/engine.js', 'shared/anim.js', 'l17/aloha.js', 'l17/ui-l17.js'],
    }),
    'l18': ('1-8-flow-matching.html', ['l01/lesson.css', 'shared/lab.css', 'l18/l18.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'l18/engine.js', 'l18/ui-l18.js'],
    }),
    'l21': ('2-1-transporter-i-cliport.html', ['l01/lesson.css', 'shared/lab.css', 'l21/l21.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'l21/engine.js', 'l21/ui-l21.js'],
    }),
    'l22': ('2-2-peract.html', ['l01/lesson.css', 'shared/lab.css', 'l22/l22.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'l22/engine.js', 'shared/anim.js', 'l22/flow.js', 'l22/ui-l22.js'],
    }),
    'l23': ('2-3-llm-planirovshchiki.html', ['l01/lesson.css', 'shared/lab.css', 'l23/l23.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'l23/engine.js', 'l23/ui-l23.js'],
    }),
    # часть 3: мир стола из 2.1 (l21/engine.js) для 3.1–3.6, рука Ады (shared/arm-core.js) для 3.7, схемы — shared/anim.js
    'l31': ('3-1-rt-1.html', ['l01/lesson.css', 'shared/lab.css', 'l31/l31.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'shared/anim.js', 'l21/engine.js', 'l31/engine.js', 'l31/ui-l31.js'],
    }),
    'l32': ('3-2-vision-language-modeli.html', ['l01/lesson.css', 'shared/lab.css', 'l32/l32.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'shared/anim.js', 'l21/engine.js', 'l32/engine.js', 'l32/ui-l32.js'],
    }),
    'l33': ('3-3-rt-2.html', ['l01/lesson.css', 'shared/lab.css', 'l33/l33.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'shared/anim.js', 'l21/engine.js', 'l33/engine.js', 'l33/ui-l33.js'],
    }),
    'l34': ('3-4-open-x-embodiment.html', ['l01/lesson.css', 'shared/lab.css', 'l34/l34.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'shared/anim.js', 'l21/engine.js', 'l34/engine.js', 'l34/ui-l34.js'],
    }),
    'l35': ('3-5-otkrytye-vla.html', ['l01/lesson.css', 'shared/lab.css', 'l35/l35.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'shared/anim.js', 'l21/engine.js', 'l35/engine.js', 'l35/ui-l35.js'],
    }),
    'l36': ('3-6-pi0.html', ['l01/lesson.css', 'shared/lab.css', 'l36/l36.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'shared/anim.js', 'l21/engine.js', 'l36/engine.js', 'l36/ui-l36.js'],
    }),
    'l37': ('3-7-dvukhurovnevye-arkhitektury.html', ['l01/lesson.css', 'shared/lab.css', 'l37/l37.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'shared/anim.js', 'shared/arm-core.js', 'l37/engine.js', 'l37/ui-l37.js'],
    }),
    'l38': ('3-8-obobshchenie-i-rassuzhdenie.html', ['l01/lesson.css', 'shared/lab.css', 'l38/l38.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'shared/anim.js', 'l21/engine.js', 'l38/engine.js', 'l38/ui-l38.js'],
    }),
    'l41': ('4-1-masshtab-dannykh.html', ['l01/lesson.css', 'shared/lab.css', 'l41/l41.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'shared/anim.js', 'l21/engine.js', 'l41/engine.js', 'l41/ui-l41.js'],
    }),
    'l42': ('4-2-teleoperatsiya.html', ['l01/lesson.css', 'shared/lab.css', 'l42/l42.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'shared/anim.js', 'shared/arm-core.js', 'l42/engine.js', 'l42/devices.js', 'l42/ui-l42.js'],
    }),
    'l43': ('4-3-datasety-robotov.html', ['l01/lesson.css', 'shared/lab.css', 'l43/l43.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'shared/anim.js', 'l21/engine.js', 'l43/engine.js', 'l43/ui-l43.js'],
    }),
    'l44': ('4-4-video-lyudey.html', ['l01/lesson.css', 'shared/lab.css', 'l44/l44.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'shared/anim.js', 'shared/arm-core.js', 'l21/engine.js', 'l44/engine.js', 'l44/ui-l44.js'],
    }),
    'l45': ('4-5-simulyatsiya.html', ['l01/lesson.css', 'shared/lab.css', 'l45/l45.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'shared/anim.js', 'l21/engine.js', 'l45/engine.js', 'l45/ui-l45.js'],
    }),
    'l46': ('4-6-piramida-dannykh.html', ['l01/lesson.css', 'shared/lab.css', 'l46/l46.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'shared/anim.js', 'l21/engine.js', 'l46/engine.js', 'l46/ui-l46.js'],
    }),
    'l51': ('5-1-osnovy-rl.html', ['l01/lesson.css', 'shared/lab.css', 'l51/l51.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'shared/anim.js', 'l51/engine.js', 'l51/ui-l51.js'],
    }),
    'l52': ('5-2-ppo.html', ['l01/lesson.css', 'shared/lab.css', 'l52/l52.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'shared/anim.js', 'shared/drive-core.js', 'l52/engine.js', 'l52/ui-l52.js'],
    }),
    'l53': ('5-3-sac.html', ['l01/lesson.css', 'shared/lab.css', 'l53/l53.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'shared/anim.js', 'shared/arm-core.js', 'l53/engine.js', 'l53/ui-l53.js'],
    }),
    'l54': ('5-4-perenos-iz-simulyatsii.html', ['l01/lesson.css', 'shared/lab.css', 'l54/l54.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'shared/anim.js', 'shared/arm-core.js', 'l54/engine.js', 'l54/ui-l54.js'],
    }),
    'l55': ('5-5-privilegirovannyy-uchitel.html', ['l01/lesson.css', 'shared/lab.css', 'l55/l55.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'shared/anim.js', 'shared/drive-core.js', 'l55/engine.js', 'l55/ui-l55.js'],
    }),
    'l56': ('5-6-offline-rl.html', ['l01/lesson.css', 'shared/lab.css', 'l56/l56.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'shared/anim.js', 'shared/drive-core.js', 'l56/engine.js', 'l56/ui-l56.js'],
    }),
    'l57': ('5-7-rl-na-realnykh-robotakh.html', ['l01/lesson.css', 'shared/lab.css', 'l57/l57.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'shared/anim.js', 'shared/arm-core.js', 'l57/engine.js', 'l57/ui-l57.js'],
    }),
    'l61': ('6-1-lokomotsiya.html', ['l01/lesson.css', 'shared/lab.css', 'l61/l61.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'shared/anim.js', 'l61/engine.js', 'l61/ui-l61.js'],
    }),
    'l62': ('6-2-imitatsiya-dvizheniy.html', ['l01/lesson.css', 'shared/lab.css', 'l62/l62.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'shared/anim.js', 'l62/engine.js', 'l62/ui-l62.js'],
    }),
    'l63': ('6-3-upravlenie-vsem-telom.html', ['l01/lesson.css', 'shared/lab.css', 'l63/l63.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'shared/anim.js', 'l63/engine.js', 'l63/ui-l63.js'],
    }),
    'l81': ('8-1-klassika-v-konture.html', ['l01/lesson.css', 'shared/lab.css', 'l81/l81.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'shared/anim.js', 'shared/arm-core.js', 'l81/engine.js', 'l81/ui-l81.js'],
    }),
    'l82': ('8-2-bezopasnost.html', ['l01/lesson.css', 'shared/lab.css', 'l82/l82.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'shared/anim.js', 'shared/kettle-core.js', 'shared/kettle-draw.js', 'l82/engine.js', 'l82/ui-l82.js'],
    }),
    'l83': ('8-3-nadezhnost.html', ['l01/lesson.css', 'shared/lab.css', 'l83/l83.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'shared/anim.js', 'l83/engine.js', 'l83/ui-l83.js'],
    }),
    # глоссарий: все термины из shared/glossary.json, без отзыва и «спасибо»
    'gl': ('glossariy.html', ['l01/lesson.css', 'gl/gl.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'gl/ui-gl.js'],
    }),
    # проверки в конце частей: без отзыва и «спасибо» в конце
    'c0': ('proverka-chasti-0.html', ['l01/lesson.css', 'shared/lab.css', 'shared/check.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/arm-core.js', 'shared/check.js', 'c0/ui-c0.js'],
    }),
    'c2': ('proverka-chasti-2.html', ['l01/lesson.css', 'shared/lab.css', 'shared/check.css', 'c2/c2.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'l21/engine.js', 'shared/check.js', 'c2/ui-c2.js'],
    }),
    'c3': ('proverka-chasti-3.html', ['l01/lesson.css', 'shared/lab.css', 'shared/check.css', 'c3/c3.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/arm-core.js', 'l37/engine.js', 'shared/check.js', 'c3/ui-c3.js'],
    }),
    'c5': ('proverka-chasti-5.html', ['l01/lesson.css', 'shared/lab.css', 'shared/check.css', 'c5/c5.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/arm-core.js', 'l51/engine.js', 'shared/check.js', 'c5/ui-c5.js'],
    }),
    'c4': ('proverka-chasti-4.html', ['l01/lesson.css', 'shared/lab.css', 'shared/check.css', 'c4/c4.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'l21/engine.js', 'l46/engine.js', 'shared/check.js', 'c4/ui-c4.js'],
    }),
    'c1': ('proverka-chasti-1.html', ['l01/lesson.css', 'shared/lab.css', 'shared/check.css', 'c1/c1.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/kettle-core.js', 'shared/kettle-draw.js', 'shared/check.js', 'c1/ui-c1.js'],
    }),
}
import json, re, urllib.parse, html as _html
CFG = json.loads((root.parent / 'site' / 'config.json').read_text(encoding='utf-8'))
sys.path.insert(0, str(root.parent / 'site'))
from published import published, asof  # noqa: E402
import seo  # noqa: E402
sys.path.insert(0, str(root.parent / 'tools'))
from i18n_extract import literals, load_dict, translate_js, CYR  # noqa: E402
PUB = {pathlib.Path(p['file']).name for p in published(CFG)}  # опубликованное на момент сборки (MR_ASOF)
# ---------- Язык сборки: ru (как есть) или en (MR_LANG=en, см. sources/i18n-spec.md) ----------
LANG = os.environ.get('MR_LANG', 'ru')
assert LANG in ('ru', 'en'), f'MR_LANG={LANG}: язык сборки — ru или en'
EN = LANG == 'en'
STRICT = '--strict' in sys.argv
LESSON_SRC = 'lesson.en.html' if EN else 'lesson.html'
OUT_DIR = root.parent / 'site' / ('en/lessons' if EN else 'lessons')
def has_en(key):
    """Есть ли у урока английский исходник (тогда есть и английская страница — на неё ведут переключатель и hreflang)."""
    return (root / key / 'lesson.en.html').exists()
_dicts = {}
def i18n_dict(folder):
    """Словарь переводов папки lessons/<folder>/i18n.en.json (пустой, если файла нет)."""
    if folder not in _dicts:
        _dicts[folder] = load_dict(root / folder / 'i18n.en.json')
    return _dicts[folder]
def js_source(f, key):
    """Файл JS для сборки. В английской версии к нему применяются словари его папки (l21/engine.js переводит
    l21/i18n.en.json, у кого бы он ни был подключён), общий shared/i18n.en.json и словарь самого урока."""
    js = (root / f).read_text(encoding='utf-8')
    if EN:
        js = translate_js(js, i18n_dict(f.split('/')[0]), i18n_dict('shared'), i18n_dict(key))
        for ru, en in EN_CODE:  # правила языка в коде (склонение по числу): русские три формы → английские две
            js = js.replace(ru, en)
    return js
# В английской сборке функции склонения по числу работают по английскому правилу: 1 — единственное число, иначе
# множественное (форма few совпадает с many в словарях перевода). Замена точная: если код функции изменится,
# сборка просто оставит русское правило, а тест английских страниц заметит странные формы.
EN_CODE = [
    ('function plural(n, one, few, many) {\n  const a = Math.abs(n) % 100, b = a % 10;',
     'function plural(n, one, few, many) {\n  if (true) return Math.abs(n) === 1 ? one : many;\n  const a = Math.abs(n) % 100, b = a % 10;'),
    ('const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10;',
     'const plural = (n, one, few, many) => { if (true) return Math.abs(n) === 1 ? one : many; const a = Math.abs(n) % 100, b = a % 10;'),
]
def check_cyrillic(page, key):
    """После подстановки переводов: сколько строковых литералов с кириллицей осталось в скриптах страницы
    (кроме JSON-данных). Предупреждение; с --strict — ошибка сборки."""
    js = '\n'.join(m.group(1) for m in re.finditer(r'<script(?![^>]*\btype="application/)[^>]*>(.*?)</script>', page, flags=re.S))
    rest = [l for l in literals(js) if CYR.search(l)]
    if rest:
        msg = f'ВНИМАНИЕ {key}: в JS английской версии осталось литералов с кириллицей: {len(rest)} (например: {rest[0][:70]!r})'
        if STRICT:
            sys.exit(msg)
        print(msg)
    return len(rest)
def only_published(page):
    """Блок <!--if:proverka-chasti-1.html-->…<!--/if--> остаётся, только если страница уже опубликована:
    так ссылка на страницу из субботнего выпуска появляется в уроке вместе с ней."""
    out = re.sub(r'<!--if:([\w.-]+\.html)-->(.*?)<!--/if-->', lambda m: m.group(2) if m.group(1) in PUB else '', page, flags=re.S)
    assert '<!--if:' not in out and '<!--/if-->' not in out, 'незакрытый блок <!--if:…-->'
    return out
SITE_URL = CFG.get('SITE_URL', '').rstrip('/')
def add_og(page, name, key):
    """Превью ссылок для мессенджеров и соцсетей: заголовок и описание берём из самого урока. Там же — canonical,
    hreflang на обе языковые версии, og:locale и разметка JSON-LD на языке сборки."""
    if 'og:title' in page or not SITE_URL:
        return page
    t = re.search(r'<title>(.*?)</title>', page, flags=re.S)
    d = re.search(r'<meta name="description" content="([^"]*)">', page)
    if not t or not d:
        return page
    title = t.group(1).strip()
    file = f'lessons/{name}'
    url = seo.page_url(SITE_URL, file, LANG)
    locale, alt_locale = ('en_US', 'ru_RU') if EN else ('ru_RU', 'en_US')
    tags = (f'<meta property="og:type" content="article">\n<meta property="og:site_name" content="{seo.COURSE_NAMES[LANG]}">\n'
            f'<meta property="og:title" content="{title}">\n<meta property="og:description" content="{d.group(1)}">\n'
            f'<meta property="og:url" content="{url}">\n<meta property="og:image" content="{SITE_URL}/assets/og.png">\n'
            f'<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">\n'
            f'<meta property="og:locale" content="{locale}">\n')
    if EN or has_en(key):  # другая языковая версия есть
        tags += f'<meta property="og:locale:alternate" content="{alt_locale}">\n'
    tags += (f'<meta name="twitter:card" content="summary_large_image">\n<link rel="canonical" href="{url}">\n'
             + seo.hreflang_links(SITE_URL, file, EN or has_en(key)))
    # разметка для поисковиков: урок как часть курса и «хлебные крошки» курс → часть → урок
    today = asof().date().isoformat()
    kick = re.search(r'<div class="kicker"><span class="num">[\d.]+</span>\s*((?:Часть|Part) \d+)\s*·\s*([^<]+)</div>', page)
    part = f'{kick.group(1)}. {kick.group(2).strip()}' if kick else None
    modified = seo.page_date(file, CFG, today)
    tags += seo.lesson_ld(SITE_URL, file, title, d.group(1), min(seo.page_first_date(file, CFG, today), today), min(modified, today), part, LANG)
    return page.replace(d.group(0), d.group(0) + '\n' + tags, 1)
FEEDBACK = ('  <div class="fb" data-fb>\n'
            '    <div class="fb-q">Урок был понятен?</div>\n'
            '    <div class="fb-opts" role="group" aria-label="Насколько понятен урок"><button type="button" data-r="good" aria-pressed="false">Всё понятно</button>'
            '<button type="button" data-r="mid" aria-pressed="false">Местами сложно</button><button type="button" data-r="bad" aria-pressed="false">Многое непонятно</button></div>\n'
            '    <div class="fb-saved" hidden aria-live="polite">✓ Оценка записана. Если хочешь, напиши, что осталось непонятным, — это необязательно.</div>\n'
            '    <div class="fb-more" hidden><label for="fbText">Что осталось непонятным или что стоит улучшить?</label>'
            '<textarea id="fbText" maxlength="1000" rows="3"></textarea>'
            '<div class="fb-row"><button type="button" class="fb-send">Отправить</button><span class="fb-note">Отзыв сохраняется без имени и контактов: адреса почты и номера телефонов удаляются ещё до отправки. Поэтому ответить на него не получится.</span></div></div>\n'
            '    <div class="fb-done" hidden aria-live="polite">Спасибо, отзыв записан.</div>\n'
            '    <div class="fb-bug">Нашли ошибку или неточность? <a href="{issue}" target="_blank" rel="noopener">Сообщить на GitHub</a></div>\n'
            '  </div>\n')
THANKS = ('<section class="thanks-end" aria-label="Отзыв и спасибо">\n'
          '{feedback}'
          '  <div class="thanks" data-thanks data-channel="{channel}"><span class="thanks-text">Урок пригодился? Скажи спасибо — так автор узнает, что курс читают.</span></div>\n'
          '</section>\n')
# то же для английской версии: разметка и атрибуты те же, тексты — по-английски
FEEDBACK_EN = ('  <div class="fb" data-fb>\n'
               '    <div class="fb-q">Was the lesson clear?</div>\n'
               '    <div class="fb-opts" role="group" aria-label="How clear was the lesson"><button type="button" data-r="good" aria-pressed="false">All clear</button>'
               '<button type="button" data-r="mid" aria-pressed="false">Hard in places</button><button type="button" data-r="bad" aria-pressed="false">Mostly unclear</button></div>\n'
               '    <div class="fb-saved" hidden aria-live="polite">✓ Rating saved. If you like, tell me what was unclear — this is optional.</div>\n'
               '    <div class="fb-more" hidden><label for="fbText">What was unclear, or what could be improved?</label>'
               '<textarea id="fbText" maxlength="1000" rows="3"></textarea>'
               '<div class="fb-row"><button type="button" class="fb-send">Send</button><span class="fb-note">Feedback is stored without a name or contacts: email addresses and phone numbers are removed before sending, so it cannot be answered.</span></div></div>\n'
               '    <div class="fb-done" hidden aria-live="polite">Thanks, your feedback is saved.</div>\n'
               '    <div class="fb-bug">Found a mistake or inaccuracy? <a href="{issue}" target="_blank" rel="noopener">Report it on GitHub</a></div>\n'
               '  </div>\n')
THANKS_EN = ('<section class="thanks-end" aria-label="Feedback and thanks">\n'
             '{feedback}'
             '  <div class="thanks" data-thanks data-channel="{channel}"><span class="thanks-text">Found this lesson useful? Say thanks — that is how the author knows the course is being read.</span></div>\n'
             '</section>\n')
def issue_url(page, name):
    """Ссылка «Сообщить на GitHub»: новая задача с названием урока и шаблоном текста (на языке версии)."""
    t = re.search(r'<title>(.*?)</title>', page, flags=re.S)
    title = t.group(1).split(' — ')[0].strip() if t else name
    url = seo.page_url(SITE_URL, f'lessons/{name}', LANG)
    body = (f'Lesson: {title} — {url}\nSection: \nWhat is wrong: \nHow it should be, if you know: \n' if EN
            else f'Урок: {title} — {url}\nРаздел: \nЧто не так: \nКак правильно, если знаешь: \n')
    return f"{CFG.get('REPO', '').rstrip('/')}/issues/new?title={urllib.parse.quote(title + ': ')}&body={urllib.parse.quote(body)}"
def add_thanks(page, name, key):
    """Конец урока: отзыв (shared/feedback.*) и кнопка «Сказать спасибо» с общим счётчиком (shared/thanks.*, адрес — THANKS_API в config.json)."""
    js = js_source('shared/thanks.js', key)
    assert '</script' not in js
    fb = (FEEDBACK_EN if EN else FEEDBACK).format(issue=_html.escape(issue_url(page, name), quote=True))
    page = page.replace('</main>', (THANKS_EN if EN else THANKS).format(feedback=fb, channel=_html.escape(CFG.get('CHANNEL', ''), quote=True)) + '</main>', 1)
    return page.replace('</body>', f'<script>\nwindow.MR_THANKS_API = {json.dumps(CFG.get("THANKS_API", ""))};\n{js}</script>\n</body>', 1)
def add_stats(page, key):
    """Анонимная статистика (shared/stats.js, адрес — STATS_API в config.json), отзыв (feedback.js) и прогресс в браузере (progress.js)."""
    js = '\n'.join(js_source('shared/' + f, key) for f in ('stats.js', 'feedback.js', 'progress.js', 'recall.js', 'glossary.js'))
    assert '</script' not in js
    return page.replace('</body>', f'<script>\nwindow.MR_STATS_API = {json.dumps(CFG.get("STATS_API", ""))};\n{js}</script>\n</body>', 1)
# ---------- Глоссарий: подсказки к терминам при первом упоминании (shared/glossary.*) ----------
GLOSSARY_ALL = json.loads((root / 'shared/glossary.json').read_text(encoding='utf-8'))
# английская версия: термин (t), определение (d) и формы для поиска (a) — из shared/glossary.en.json по id,
# остальное (урок, раздел, only, before) — из русского файла; термин без перевода в английской версии не показывается
GLOSSARY_EN = {g['id']: g for g in json.loads((root / 'shared/glossary.en.json').read_text(encoding='utf-8'))} if EN and (root / 'shared/glossary.en.json').exists() else {}
if EN and not GLOSSARY_EN:
    print('ВНИМАНИЕ: нет lessons/shared/glossary.en.json — в английской версии подсказок к терминам и глоссария не будет')
def gl_lang(g):
    """Запись глоссария на языке сборки (после подстановки 'before', чтобы определение было переведённым)."""
    if not EN:
        return g
    e = GLOSSARY_EN.get(g['id'])
    return {**g, 't': e['t'], 'd': e['d'], 'a': e['a']} if e else None
# термины уроков, которые ещё не вышли на момент сборки, не показываем: ни в подсказках, ни на странице глоссария
# термин, который переезжает в более поздний урок, до его выхода берёт поля из 'before' (урок, раздел, определение)
GLOSSARY = [x for x in (gl_lang(g if LESSONS[g['l']][0] in PUB else {**g, **g['before']}) for g in GLOSSARY_ALL
            if LESSONS[g['l']][0] in PUB or (g.get('before') and LESSONS[g['before']['l']][0] in PUB)) if x]
SKIP_TAGS = {'a', 'h1', 'h2', 'h3', 'h4', 'button', 'label', 'code', 'pre', 'script', 'style', 'summary', 'svg', 'canvas', 'select', 'textarea', 'figcaption'}
_gl_info = None
def gl_info():
    """Для каждого термина: номер и файл урока, где он вводится, и название раздела."""
    global _gl_info
    if _gl_info is None:
        _gl_info, titles = {}, {}
        for g in GLOSSARY:
            name = LESSONS[g['l']][0]
            if g['l'] not in titles:  # названия разделов — из исходника на языке сборки (если английского нет — из русского)
                src = (root / g['l'] / (LESSON_SRC if (root / g['l'] / LESSON_SRC).exists() else 'lesson.html')).read_text(encoding='utf-8')
                titles[g['l']] = {m.group(1): re.sub(r'<[^>]+>', '', h.group(1)).strip()
                                  for m in re.finditer(r'<section[^>]*\bid="([a-z][a-zA-Z0-9-]*)"[^>]*>(.*?)</section>', src, flags=re.S)
                                  for h in [re.search(r'<h2[^>]*>(.*?)</h2>', m.group(2), flags=re.S)] if h}
            _gl_info[g['id']] = {'t': g['t'], 'en': g['en'], 'd': g['d'], 'k': g['l'], 'n': '.'.join(name.split('-')[:2]),
                                 'href': f"{name}#{g['sec']}", 'st': titles[g['l']].get(g['sec'], '')}
    return _gl_info
def glossarize(page, key):
    """Первое упоминание каждого термина в тексте урока (абзацы и списки внутри разделов, не в заголовках, ссылках,
    формулах и кнопках) оборачивается в <span class="gl">; данные о найденных терминах кладутся в урок как JSON."""
    a, b = page.find('<main>'), page.find('</main>')
    if a < 0 or b < 0:
        return page
    pats = sorted(((g, re.compile(r'(?<![\w-])(?:' + g['a'].replace(' ', r'(?:\s|&nbsp;)+') + r')(?![\w-])', re.I))
                   for g in GLOSSARY if not g.get('only') or key in g['only']), key=lambda x: -len(x[0]['a']))
    used, out, section_ok, prose, skip, katex = {}, [], False, 0, 0, 0
    for part in re.split(r'(<[^>]+>)', page[a:b]):
        if part.startswith('<'):
            m = re.match(r'<(/?)([a-zA-Z0-9]+)', part)
            if m:
                close, tag = m.group(1) == '/', m.group(2).lower()
                if tag == 'section':
                    section_ok = not close and 'class="section' in part
                elif katex:
                    katex += -1 if (close and tag == 'span') else 1 if (tag == 'span' and not part.endswith('/>')) else 0
                elif tag == 'span' and not close and 'katex' in part:
                    katex = 1
                elif tag in ('p', 'li'):
                    prose += -1 if close else 1
                elif tag in SKIP_TAGS:
                    skip += -1 if close else 1
            out.append(part)
            continue
        if not (section_ok and prose > 0 and skip == 0 and katex == 0) or not part.strip():
            out.append(part)
            continue
        spans = []
        for g, rx in pats:
            if g['id'] in used:
                continue
            for m in rx.finditer(part):
                if all(m.end() <= x or m.start() >= y for x, y, _ in spans):
                    spans.append((m.start(), m.end(), g['id'])); used[g['id']] = True
                    break
        for x, y, gid in sorted(spans, reverse=True):
            part = part[:x] + f'<span class="gl" data-gl="{gid}" tabindex="0">{part[x:y]}</span>' + part[y:]
        out.append(part)
    if not used:
        return page
    info = gl_info()
    data = {gid: {**info[gid], 'here': info[gid]['k'] == key} for gid in used}
    tag = '<script type="application/json" id="glData">' + json.dumps(data, ensure_ascii=False).replace('</', '<\\/') + '</script>\n'
    return page[:a] + ''.join(out) + tag + page[b:]
def lang_switch(key, name):
    """Переключатель языка в шапке урока: «EN» на русской странице (на английскую версию урока, а без неё — на
    английскую главную), «RU» на английской — на русскую версию того же урока."""
    if EN:
        return f'<a class="topbar-lang" href="../../lessons/{name}" hreflang="ru" lang="ru" title="Русская версия">RU</a>'
    if has_en(key):
        return f'<a class="topbar-lang" href="../en/lessons/{name}" hreflang="en" lang="en" title="English version">EN</a>'
    return '<a class="topbar-lang" href="../en/" hreflang="en" lang="en" title="This lesson is not translated yet">EN</a>'
def build(key):
    name, css_files, js_map = LESSONS[key]
    html = only_published((root / key / LESSON_SRC).read_text(encoding='utf-8'))
    if EN:  # язык документа — английский (переводчик мог оставить lang="ru")
        html = re.sub(r'<html\s+lang="ru(?:-RU)?"', '<html lang="en"', html, count=1)
        assert re.search(r'<html[^>]*\blang="en(?:-[A-Za-z]+)?"', html), f'{key}/lesson.en.html: нужен <html lang="en">'
    if '\\(' in html or '\\[' in html:  # формулы KaTeX рендерим сразу в HTML, в браузер — только стили и шрифты
        r = subprocess.run(['node', str(root.parent / 'tools/katex_render.js'), key], input=html, capture_output=True, text=True, encoding='utf-8')
        if r.returncode:
            sys.exit(r.stderr.strip())
        html = r.stdout
        html = html.replace('<link rel="stylesheet" href="../assets/fonts/fonts.css">',
                            '<link rel="stylesheet" href="../assets/fonts/fonts.css">\n<link rel="stylesheet" href="../assets/katex/katex.min.css">', 1)
    if key.startswith('l'):
        html = glossarize(html, key)
    if key == 'gl':
        info = gl_info()
        html = html.replace('@@GLOSSARY_JSON@@', json.dumps([{**info[g['id']], 'id': g['id']} for g in GLOSSARY], ensure_ascii=False).replace('</', '<\\/'))
    css = '\n'.join((root / f).read_text(encoding='utf-8') for f in css_files + ['shared/thanks.css', 'shared/feedback.css', 'shared/recall.css', 'shared/glossary.css'])
    assert '/*@@CSS@@*/' in html
    html = html.replace('/*@@CSS@@*/', css)
    for marker, files in js_map.items():
        js = '\n'.join(js_source(f, key) for f in files)
        assert '</script' not in js, 'в JS не должно быть закрывающего тега script'
        assert marker in html, marker
        html = html.replace(marker, js)
    html = add_og(html, name, key)
    assert '<button class="theme-btn"' in html and '</footer>' in html, key
    if key != 'gl':  # путь в глоссарий: ссылка в верхней панели (на широких экранах) и в подвале
        html = html.replace('<button class="theme-btn"', ('<a class="topbar-gl" href="glossariy.html">Glossary</a>' if EN else
                            '<a class="topbar-gl" href="glossariy.html">Глоссарий</a>') + '\n    <button class="theme-btn"', 1)
        html = html.replace('</footer>', ('  <p class="foot-gl"><a href="glossariy.html">Course glossary</a> — terms with definitions and links to the lessons.</p>\n' if EN else
                            '  <p class="foot-gl"><a href="glossariy.html">Глоссарий курса</a> — термины с определениями и ссылками на уроки.</p>\n') + '</footer>', 1)
    # переключатель языка — рядом с кнопкой темы
    html = html.replace('<button class="theme-btn"', lang_switch(key, name) + '\n    <button class="theme-btn"', 1)
    # политика конфиденциальности — в подвале каждой страницы курса (внутри /en/ ссылка ведёт на английскую)
    html = html.replace('</footer>', ('  <p class="foot-pp"><a href="../privacy.html">Privacy policy</a></p>\n' if EN else
                        '  <p class="foot-pp"><a href="../privacy.html">Политика конфиденциальности</a></p>\n') + '</footer>', 1)
    notice = CFG.get('NOTICE_EN' if EN else 'NOTICE')
    if notice:  # временная плашка под шапкой, как на сайте (site/config.json → NOTICE / NOTICE_EN)
        html = re.sub(r'(<main[^>]*>)', lambda m: m.group(1) + '\n<div class="site-notice" role="status">' + notice + '</div>', html, count=1)
    if key.startswith('l'):
        html = add_thanks(html, name, key)
    html = add_stats(html, key)
    if EN:  # страница лежит на уровень глубже (/en/lessons/), общие ассеты — те же
        html = html.replace('../assets/', '../../assets/')
        check_cyrillic(html, key)
    out = OUT_DIR / name
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding='utf-8')
    print(f'OK {out.relative_to(root.parent)} ({out.stat().st_size/1024:.0f} КБ)')
args = [a for a in sys.argv[1:] if not a.startswith('--')]
keys = list(LESSONS) if (args and args[0] == 'all') else [args[0] if args else 'l01']
def assets_of(k):
    name, css, js = LESSONS[k]
    return [root / k / 'lesson.html'] + [root / f for f in css] + [root / f for group in js.values() for f in group]
for k in keys:
    missing = [str(f.relative_to(root)) for f in assets_of(k) if not f.exists()]
    if missing:
        print(f'— {k}: не хватает файлов ({", ".join(missing[:3])}), пропускаю'); continue
    if EN and not has_en(k):
        if len(keys) == 1:
            print(f'— {k}: нет {k}/lesson.en.html, английская версия не собирается')
        continue
    build(k)
if '--both' in sys.argv and not EN:  # вторая версия — отдельным запуском, у неё свои словари и глоссарий
    subprocess.run([sys.executable, __file__] + [a for a in sys.argv[1:] if a != '--both'], check=True, env={**os.environ, 'MR_LANG': 'en'})
