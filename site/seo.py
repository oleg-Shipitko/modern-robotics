"""Данные для поисковиков: даты последнего изменения страниц и разметка schema.org (JSON-LD).
Дата страницы — последний коммит её исходников в git, но не раньше дня выпуска (страница появилась на сайте
в день выпуска). Без git — сегодняшняя дата."""
import json
import pathlib
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
AUTHOR = {'@type': 'Person', 'name': 'Олег Шипитько'}
AUTHOR_EN = {'@type': 'Person', 'name': 'Oleg Shipitko'}
COURSE_NAME = 'Modern Robotics и Physical AI'
COURSE_NAMES = {'ru': COURSE_NAME, 'en': 'Modern Robotics and Physical AI'}
TEACHES = {'ru': 'Нейросетевое управление роботами: обучение по демонстрациям, VLA-модели, обучение с подкреплением, гуманоиды, модели мира',
           'en': 'Neural-network robot control: imitation learning, VLA models, reinforcement learning, humanoids, world models'}
RESOURCE_TYPE = {'ru': ('Проверка части', 'Глоссарий', 'Урок'), 'en': ('Part check', 'Glossary', 'Lesson')}
LANGS = ['ru', 'en']  # языки сайта; английская версия — с префиксом /en/


def site_root(site_url, lang):
    """Корень версии сайта: https://…/ для русской, https://…/en/ для английской."""
    return site_url + ('/en/' if lang == 'en' else '/')


def page_url(site_url, file, lang):
    """Адрес страницы в версии lang (file — путь от корня русской версии, например lessons/1-1-behavior-cloning.html)."""
    return site_root(site_url, lang) + file


def git_first_date(*paths):
    """Дата первого коммита, добавившего файлы по путям (ГГГГ-ММ-ДД), или ''."""
    try:
        out = subprocess.run(['git', 'log', '--diff-filter=A', '--format=%cs', '--'] + [str(p) for p in paths],
                             cwd=ROOT, capture_output=True, text=True, timeout=20).stdout.split()
    except Exception:
        return ''
    return out[-1] if out else ''


def page_first_date(file, cfg, today):
    """Дата появления страницы: день выпуска, а без него — первый коммит исходников."""
    release = next((p.get('date', '') for p in cfg.get('PUBLISHED', []) if p['file'] == file), '')
    if release:
        return release
    d = lesson_dirs().get(pathlib.Path(file).name)
    return (git_first_date(d) if d else '') or today


def git_date(*paths):
    """Дата последнего коммита, который трогал любой из путей (ГГГГ-ММ-ДД), или ''."""
    try:
        out = subprocess.run(['git', 'log', '-1', '--format=%cs', '--'] + [str(p) for p in paths],
                             cwd=ROOT, capture_output=True, text=True, timeout=20).stdout.strip()
    except Exception:
        return ''
    return out


def lesson_dirs():
    """Имя страницы урока → папка исходников (по записям LESSONS в lessons/build.py)."""
    src = (ROOT / 'lessons/build.py').read_text(encoding='utf-8')
    return {m.group(2): ROOT / 'lessons' / m.group(1) for m in re.finditer(r"'(\w+)': \('([^']+\.html)'", src)}


def page_date(file, cfg, today):
    """Дата изменения страницы из PUBLISHED: исходники урока + glossary.json для глоссария, не раньше дня выпуска."""
    name = pathlib.Path(file).name
    d = lesson_dirs().get(name)
    paths = [d] if d else []
    if name == 'glossariy.html':
        paths.append(ROOT / 'lessons/shared/glossary.json')
    got = git_date(*paths) if paths else ''
    release = next((p.get('date', '') for p in cfg.get('PUBLISHED', []) if p['file'] == file), '')
    return max(got or today, release or '')


def ld(obj):
    return '<script type="application/ld+json">' + json.dumps(obj, ensure_ascii=False).replace('</', '<\\/') + '</script>\n'


def course_ld(site_url, description, published, names, lang='ru'):
    """Разметка курса для главной: Course + список уроков (hasPart) версии lang; курс доступен на обоих языках."""
    author = AUTHOR_EN if lang == 'en' else AUTHOR
    parts = [{'@type': 'LearningResource', 'name': names.get(p['file'], p['n']), 'url': page_url(site_url, p['file'], lang), 'position': i + 1}
             for i, p in enumerate(published)]
    return ld({
        '@context': 'https://schema.org', '@type': 'Course', 'name': COURSE_NAMES[lang], 'url': site_root(site_url, lang),
        'description': description, 'inLanguage': lang, 'availableLanguage': LANGS, 'isAccessibleForFree': True,
        'provider': author, 'author': author,
        'educationalLevel': 'Advanced', 'teaches': TEACHES[lang],
        'hasCourseInstance': {'@type': 'CourseInstance', 'courseMode': 'online', 'courseWorkload': 'PT40M'},
        'hasPart': parts,
    })


def lesson_ld(site_url, file, title, description, date_published, date_modified, part=None, lang='ru'):
    """Разметка урока: LearningResource внутри курса + «хлебные крошки» курс → часть → урок (на языке версии)."""
    url, home = page_url(site_url, file, lang), site_root(site_url, lang)
    author, kinds = (AUTHOR_EN if lang == 'en' else AUTHOR), RESOURCE_TYPE[lang]
    title = title.split(' — ')[0].strip()
    res = {
        '@context': 'https://schema.org', '@type': 'LearningResource', 'name': title, 'url': url,
        'description': description, 'inLanguage': lang, 'isAccessibleForFree': True,
        'learningResourceType': kinds[0] if 'proverka' in file else (kinds[1] if 'glossariy' in file else kinds[2]),
        'author': author, 'datePublished': date_published, 'dateModified': date_modified,
        'isPartOf': {'@type': 'Course', 'name': COURSE_NAMES[lang], 'url': home},
    }
    crumbs = [{'@type': 'ListItem', 'position': 1, 'name': COURSE_NAMES[lang], 'item': home}]
    if part:
        crumbs.append({'@type': 'ListItem', 'position': 2, 'name': part, 'item': home + '#program'})
    crumbs.append({'@type': 'ListItem', 'position': len(crumbs) + 1, 'name': title, 'item': url})
    bc = {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': crumbs}
    return ld(res) + ld(bc)


def hreflang_links(site_url, file, has_en, newline='\n'):
    """<link rel="alternate" hreflang>: русская версия всегда, английская — если она есть, x-default — русская.
    file — путь страницы от корня ('' — главная)."""
    ru, en = page_url(site_url, file, 'ru'), page_url(site_url, file, 'en')
    out = f'<link rel="alternate" hreflang="ru" href="{ru}">{newline}'
    if has_en:
        out += f'<link rel="alternate" hreflang="en" href="{en}">{newline}'
    return out + f'<link rel="alternate" hreflang="x-default" href="{ru}">{newline}'


def sitemap_url(site_url, file, lang, lastmod, has_en):
    """Запись sitemap для версии lang страницы file с xhtml:link на обе версии (пространство имён xhtml — в <urlset>)."""
    ru, en = page_url(site_url, file, 'ru'), page_url(site_url, file, 'en')
    alt = f'<xhtml:link rel="alternate" hreflang="ru" href="{ru}"/>'
    if has_en:
        alt += f'<xhtml:link rel="alternate" hreflang="en" href="{en}"/>'
    alt += f'<xhtml:link rel="alternate" hreflang="x-default" href="{ru}"/>'
    return f'  <url><loc>{en if lang == "en" else ru}</loc><lastmod>{lastmod}</lastmod>{alt}</url>\n'
