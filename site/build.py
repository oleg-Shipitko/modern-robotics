#!/usr/bin/env python3
"""Сборка страниц сайта: подставляет SVG-спрайт, ссылки и список опубликованных уроков из config.json,
пишет robots.txt и sitemap.xml.
Запуск:  python3 site/build.py   — на текущий момент;
         MR_ASOF=2026-10-10 python3 site/build.py   — каким сайт станет в 09:00 этого дня (см. published.py).
Английская версия (sources/i18n-spec.md): страницы site/en/*.html собираются из *.en.src.html с теми же
подстановками; пока английского исходника нет — страница пропускается. READY_JSON для неё — только уроки
с собранной английской страницей (site/en/lessons/, их делает MR_LANG=en lessons/build.py), READY_RU_JSON —
все опубликованные русские (ссылки ../lessons/…, чтобы пометить «пока только по-русски»). «Что нового» —
из changelog.en.json, записи без перевода берутся из русского файла. Переключатель языка, hreflang,
JSON-LD и обе версии в sitemap.xml добавляет сборка; в исходниках языковой логики нет.
"""
import json, pathlib, re, shutil, sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / 'tools'))
from published import asof, published as published_on  # noqa: E402
import seo  # noqa: E402
from i18n_extract import literals, load_dict, translate_js, CYR  # noqa: E402
cfg = json.loads((HERE / 'config.json').read_text(encoding='utf-8'))
sprite = (HERE / 'assets/sprite.svg.html').read_text(encoding='utf-8')
shutil.copyfile(HERE.parent / 'lessons/shared/kit.js', HERE / 'assets/hero/kit.js')  # один источник для сайта и уроков
for f in ('thanks.js', 'thanks.css', 'stats.js'):  # кнопка «Сказать спасибо» и анонимная статистика — общие с уроками
    shutil.copyfile(HERE.parent / 'lessons/shared' / f, HERE / 'assets' / f)

published = published_on(cfg)  # на момент сборки: уроки с датой выпуска появляются в 09:00 этого дня
vals = {k: v for k, v in cfg.items() if isinstance(v, str)}
vals['READY_JSON'] = json.dumps({p['n']: p['file'] for p in published}, ensure_ascii=False)
vals['THANKS_API_JSON'] = json.dumps(cfg.get('THANKS_API', ''))
vals['STATS_API_JSON'] = json.dumps(cfg.get('STATS_API', ''))

# «Что нового»: запись видна со своего дня (по московской дате); субботняя выкладка идёт после 09:00, так что уроки и запись о них выходят вместе
MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
def ru_date(d):
    y, m, dd = (int(x) for x in d.split('-'))
    return f'{dd} {MONTHS[m - 1]} {y}'
def en_date(d):
    y, m, dd = (int(x) for x in d.split('-'))
    return f'{dd} {MONTHS_EN[m - 1]} {y}'
log = json.loads((HERE / 'changelog.json').read_text(encoding='utf-8'))
moment = asof()
shown = [v for v in log['versions'] if v['date'] <= moment.date().isoformat()]
def esc(t):
    return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
def changelog_html(versions, fmt_date):
    return ''.join(
        f'<section class="card cl-v" id="v{v["v"].replace(".", "-")}"><div class="top"><span class="ver">{esc(v["v"])}</span><h2>{esc(v["title"])}</h2><span class="date">{fmt_date(v["date"])}</span></div>'
        + '<ul>' + ''.join(f'<li>{esc(i)}</li>' for i in v['items']) + '</ul></section>\n' for v in versions)
vals['CHANGELOG_HTML'] = changelog_html(shown, ru_date)
vals['VERSION'] = shown[0]['v'] if shown else ''
vals['VERSION_DATE'] = ru_date(shown[0]['date']) if shown else ''
site_url = vals.get('SITE_URL', '').rstrip('/')

# ---------- Английская версия: что из неё есть ----------
en_src = sorted(HERE.glob('*.en.src.html'))
en_pages = {p.name.replace('.en.src.html', '.html') for p in en_src}  # страницы сайта с английским исходником
en_lessons = [p for p in published if (HERE / 'en' / p['file']).exists()]  # уроки с собранной английской страницей
log_en = json.loads((HERE / 'changelog.en.json').read_text(encoding='utf-8')) if (HERE / 'changelog.en.json').exists() else {'versions': []}
en_by_v = {v['v']: v for v in log_en['versions']}
vals_en = dict(vals)
vals_en['READY_JSON'] = json.dumps({p['n']: p['file'] for p in en_lessons}, ensure_ascii=False)
vals_en['READY_RU_JSON'] = json.dumps({p['n']: '../' + p['file'] for p in published}, ensure_ascii=False)
vals_en['CHANGELOG_HTML'] = changelog_html([en_by_v.get(v['v'], v) for v in shown], en_date)
vals_en['VERSION_DATE'] = en_date(shown[0]['date']) if shown else ''
vals_en['NOTICE'] = cfg.get('NOTICE_EN', '')

def page_file(page):
    """Путь страницы от корня версии для адресов: главная — '', остальные — имя файла."""
    return '' if page == 'index.html' else page
def lang_switch(page, lang):
    """Ссылка на ту же страницу другой версии: «EN» на русской (без перевода — на английскую главную), «RU» на английской.
    Страница 404 показывается по любому адресу, поэтому у неё ссылки абсолютные."""
    if lang == 'en':
        href = '/' if page == '404.html' else f'../{page_file(page) or "index.html"}'
        return f'<a class="icon-btn lang-btn" href="{href}" hreflang="ru" lang="ru" title="Русская версия">RU</a>'
    if page == '404.html':
        return '<a class="icon-btn lang-btn" href="/en/" hreflang="en" lang="en" title="English version">EN</a>'
    if page in en_pages:
        return f'<a class="icon-btn lang-btn" href="en/{page_file(page)}" hreflang="en" lang="en" title="English version">EN</a>'
    return '<a class="icon-btn lang-btn" href="en/" hreflang="en" lang="en" title="This page is not translated yet">EN</a>'
def with_lang(html, page, lang):
    """Переключатель языка (в навигации, в шапке страницы или в подвале) и hreflang в <head> — добавляет сборка."""
    sw = lang_switch(page, lang)
    if 'id="themeBtn"' in html:  # главная: рядом с кнопкой темы
        html = html.replace('<button class="icon-btn" id="themeBtn"', sw + '\n  <button class="icon-btn" id="themeBtn"', 1)
    elif re.search(r'<div class="(?:cl|pp)-head">.*</div>[ \t]*$', html, flags=re.M):  # «Что нового», политика: шапка с «← На главную»
        html = re.sub(r'(<div class="(?:cl|pp)-head">.*)(</div>)[ \t]*$', lambda m: m.group(1) + sw.replace('icon-btn lang-btn', 'lang-link') + m.group(2), html, count=1, flags=re.M)
    else:  # 404: в подвал
        html = re.sub(r'(<footer class="foot"><div class="wrap">\n.*)(\n</div></footer>)', lambda m: m.group(1) + sw.replace('icon-btn lang-btn', 'lang-link') + m.group(2), html, count=1)
    links = seo.hreflang_links(site_url, page_file(page), page in en_pages) if site_url and page != '404.html' else ''
    return html.replace('</head>', links + '</head>', 1)

missing = set()
def render(src, values, lang):
    """Страница из исходника: спрайт, подстановки {{…}}, плашка NOTICE, переключатель языка и hreflang."""
    html = src.read_text(encoding='utf-8').replace('<!--SPRITE-->', sprite)
    def sub(m):
        key = m.group(1)
        val = values.get(key, '')
        if not val:
            missing.add(key)
            return '#'
        return val
    html = re.sub(r'\{\{([A-Z_]+)\}\}', sub, html)
    if values.get('NOTICE'):  # временная плашка под шапкой
        html = re.sub(r'(<main[^>]*>)', lambda m: m.group(1) + '\n<div class="site-notice" role="status">' + values['NOTICE'] + '</div>', html, count=1)
    page = src.name.replace('.en.src.html', '.html').replace('.src.html', '.html')
    if page in ('index.html', 'changelog.html', 'privacy.html', '404.html'):
        html = with_lang(html, page, lang)
    return html

for src in sorted(HERE.glob('*.src.html')):
    if src.name.endswith('.en.src.html'):
        continue
    html = render(src, vals, 'ru')
    out = HERE / src.name.replace('.src.html', '.html')
    out.write_text(html, encoding='utf-8')
    print(f'{out.name}: {len(html) // 1024} КБ')

# английские страницы: ассеты общие (../assets/), скрипты с русскими строками — переведённые копии *.en.js
def en_script(rel):
    """Скрипт сайта для английской страницы: если в нём есть литералы с кириллицей — копия assets/….en.js с переводами
    из site/i18n.en.json и lessons/shared/i18n.en.json (kit.js и thanks.js — копии из shared), иначе тот же файл."""
    src = HERE / rel
    if not src.exists():
        return rel
    js = src.read_text(encoding='utf-8')
    if not any(CYR.search(l) for l in literals(js)):
        return rel
    js = translate_js(js, load_dict(HERE / 'i18n.en.json'), load_dict(HERE.parent / 'lessons/shared/i18n.en.json'))
    # название канала «Продакт роботов» в английской версии намеренно остаётся по-русски
    rest = sum(1 for l in literals(js) if CYR.search(l) and 'Продакт роботов' not in l)
    if rest:
        print(f'ВНИМАНИЕ: {rel}: в английской копии осталось литералов с кириллицей: {rest} (словарь — site/i18n.en.json, заготовка: python3 tools/i18n_extract.py site)', file=sys.stderr)
    out = src.with_suffix('.en.js')
    out.write_text(js, encoding='utf-8')
    return str(out.relative_to(HERE))
if en_src:
    (HERE / 'en').mkdir(exist_ok=True)
for src in en_src:
    html = render(src, vals_en, 'en')
    html = re.sub(r'((?:href|src)=")assets/', r'\1../assets/', html).replace('url(assets/', 'url(../assets/')
    html = re.sub(r'src="\.\./(assets/[\w./-]+\.js)"', lambda m: f'src="../{en_script(m.group(1))}"', html)
    out = HERE / 'en' / src.name.replace('.en.src.html', '.html')
    out.write_text(html, encoding='utf-8')
    print(f'en/{out.name}: {len(html) // 1024} КБ')
for page in ('index.html', 'changelog.html', 'privacy.html', '404.html'):
    if page not in en_pages:
        print(f'— en/{page}: нет site/{page.replace(".html", ".en.src.html")}, английская страница не собирается')

# robots.txt и sitemap.xml — только опубликованные страницы
for p in published:
    if not (HERE / p['file']).exists():
        print(f'ВНИМАНИЕ: опубликованный урок {p["n"]} не собран: {p["file"]}', file=sys.stderr)
today = asof().date().isoformat()
# даты страниц: последний коммит исходников, но не раньше дня выпуска; главная меняется с каждым выпуском и записью «Что нового»
log_date = shown[0]['date'] if shown else ''
index_date = max(seo.git_date(HERE / 'index.src.html', HERE / 'config.json') or today, log_date, max((p.get('date', '') for p in published), default=''))
# (путь от корня версии, дата, есть ли английская версия); у английской страницы та же дата, что у русской
pages = [('', index_date, 'index.html' in en_pages), ('changelog.html', max(seo.git_date(HERE / 'changelog.src.html') or today, log_date), 'changelog.html' in en_pages),
         ('privacy.html', seo.git_date(HERE / 'privacy.src.html') or today, 'privacy.html' in en_pages)] + \
        [(p['file'], seo.page_date(p['file'], cfg, today), (HERE / 'en' / p['file']).exists()) for p in published]
urls = ''.join(seo.sitemap_url(site_url, f, 'ru', min(d, today), en) + (seo.sitemap_url(site_url, f, 'en', min(d, today), True) if en else '') for f, d, en in pages)
(HERE / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n'
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + urls + '</urlset>\n', encoding='utf-8')
# разметка курса для поисковиков на главной: Course + список опубликованных уроков (в каждой версии — её страницы)
def add_course_ld(index, lessons, lang):
    if not index.exists():
        return
    index_html = index.read_text(encoding='utf-8')
    if 'application/ld+json' in index_html:
        return
    names = {}
    for p in lessons:
        f = (HERE / 'en' if lang == 'en' else HERE) / p['file']
        if f.exists():
            m = re.search(r'<title>(.*?)</title>', f.read_text(encoding='utf-8'), flags=re.S)
            if m:
                names[p['file']] = m.group(1).split(' — ')[0].strip()
    desc = re.search(r'<meta name="description" content="([^"]*)">', index_html)
    index_html = index_html.replace('</head>', seo.course_ld(site_url, desc.group(1) if desc else '', lessons, names, lang) + '</head>', 1)
    index.write_text(index_html, encoding='utf-8')
add_course_ld(HERE / 'index.html', published, 'ru')
if 'index.html' in en_pages:
    add_course_ld(HERE / 'en/index.html', en_lessons, 'en')
(HERE / 'robots.txt').write_text(f'User-agent: *\nAllow: /\nSitemap: {site_url}/sitemap.xml\n', encoding='utf-8')
n_en = sum(1 for f, d, en in pages if en)
print(f'sitemap.xml: {len(pages) + n_en} адресов (английских: {n_en}), robots.txt')
if not cfg.get('THANKS_API'):
    print('THANKS_API не задан — кнопка «Сказать спасибо» работает без счётчика (см. server/thanks/deploy.sh)', file=sys.stderr)
if missing:
    print('Не заданы ссылки:', ', '.join(sorted(missing)), '— заполните config.json', file=sys.stderr)
