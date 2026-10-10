"""Данные для поисковиков: даты последнего изменения страниц и разметка schema.org (JSON-LD).
Дата страницы — последний коммит её исходников в git, но не раньше дня выпуска (страница появилась на сайте
в день выпуска). Без git — сегодняшняя дата."""
import json
import pathlib
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
AUTHOR = {'@type': 'Person', 'name': 'Олег Шипитько'}
COURSE_NAME = 'Modern Robotics и Physical AI'


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


def course_ld(site_url, description, published, names):
    """Разметка курса для главной: Course + список уроков (hasPart)."""
    parts = [{'@type': 'LearningResource', 'name': names.get(p['file'], p['n']), 'url': f"{site_url}/{p['file']}", 'position': i + 1}
             for i, p in enumerate(published)]
    return ld({
        '@context': 'https://schema.org', '@type': 'Course', 'name': COURSE_NAME, 'url': site_url + '/',
        'description': description, 'inLanguage': 'ru', 'isAccessibleForFree': True,
        'provider': AUTHOR, 'author': AUTHOR,
        'educationalLevel': 'Advanced', 'teaches': 'Нейросетевое управление роботами: обучение по демонстрациям, VLA-модели, обучение с подкреплением, гуманоиды, модели мира',
        'hasCourseInstance': {'@type': 'CourseInstance', 'courseMode': 'online', 'courseWorkload': 'PT40M'},
        'hasPart': parts,
    })


def lesson_ld(site_url, file, title, description, date_published, date_modified, part=None):
    """Разметка урока: LearningResource внутри курса + «хлебные крошки» курс → часть → урок."""
    url = f'{site_url}/{file}'
    title = title.split(' — ')[0].strip()
    res = {
        '@context': 'https://schema.org', '@type': 'LearningResource', 'name': title, 'url': url,
        'description': description, 'inLanguage': 'ru', 'isAccessibleForFree': True,
        'learningResourceType': 'Проверка части' if 'proverka' in file else ('Глоссарий' if 'glossariy' in file else 'Урок'),
        'author': AUTHOR, 'datePublished': date_published, 'dateModified': date_modified,
        'isPartOf': {'@type': 'Course', 'name': COURSE_NAME, 'url': site_url + '/'},
    }
    crumbs = [{'@type': 'ListItem', 'position': 1, 'name': COURSE_NAME, 'item': site_url + '/'}]
    if part:
        crumbs.append({'@type': 'ListItem', 'position': 2, 'name': part, 'item': site_url + '/#program'})
    crumbs.append({'@type': 'ListItem', 'position': len(crumbs) + 1, 'name': title, 'item': url})
    bc = {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': crumbs}
    return ld(res) + ld(bc)
