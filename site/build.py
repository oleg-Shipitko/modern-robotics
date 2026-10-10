#!/usr/bin/env python3
"""Сборка страниц сайта: подставляет SVG-спрайт, ссылки и список опубликованных уроков из config.json,
пишет robots.txt и sitemap.xml.
Запуск:  python3 site/build.py   — на текущий момент;
         MR_ASOF=2026-10-10 python3 site/build.py   — каким сайт станет в 09:00 этого дня (см. published.py).
"""
import json, pathlib, re, shutil, sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from published import asof, published as published_on  # noqa: E402
import seo  # noqa: E402
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
def ru_date(d):
    y, m, dd = (int(x) for x in d.split('-'))
    return f'{dd} {MONTHS[m - 1]} {y}'
log = json.loads((HERE / 'changelog.json').read_text(encoding='utf-8'))
moment = asof()
shown = [v for v in log['versions'] if v['date'] <= moment.date().isoformat()]
def esc(t):
    return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
vals['CHANGELOG_HTML'] = ''.join(
    f'<section class="card cl-v" id="v{v["v"].replace(".", "-")}"><div class="top"><span class="ver">{esc(v["v"])}</span><h2>{esc(v["title"])}</h2><span class="date">{ru_date(v["date"])}</span></div>'
    + '<ul>' + ''.join(f'<li>{esc(i)}</li>' for i in v['items']) + '</ul></section>\n' for v in shown)
vals['VERSION'] = shown[0]['v'] if shown else ''
vals['VERSION_DATE'] = ru_date(shown[0]['date']) if shown else ''
site_url = vals.get('SITE_URL', '').rstrip('/')

missing = set()
for src in sorted(HERE.glob('*.src.html')):
    html = src.read_text(encoding='utf-8').replace('<!--SPRITE-->', sprite)
    def sub(m):
        key = m.group(1)
        val = vals.get(key, '')
        if not val:
            missing.add(key)
            return '#'
        return val
    html = re.sub(r'\{\{([A-Z_]+)\}\}', sub, html)
    out = HERE / src.name.replace('.src.html', '.html')
    out.write_text(html, encoding='utf-8')
    print(f'{out.name}: {len(html) // 1024} КБ')

# robots.txt и sitemap.xml — только опубликованные страницы
for p in published:
    if not (HERE / p['file']).exists():
        print(f'ВНИМАНИЕ: опубликованный урок {p["n"]} не собран: {p["file"]}', file=sys.stderr)
today = asof().date().isoformat()
# даты страниц: последний коммит исходников, но не раньше дня выпуска; главная меняется с каждым выпуском и записью «Что нового»
log_date = shown[0]['date'] if shown else ''
index_date = max(seo.git_date(HERE / 'index.src.html', HERE / 'config.json') or today, log_date, max((p.get('date', '') for p in published), default=''))
urls = [(f'{site_url}/', index_date), (f'{site_url}/changelog.html', max(seo.git_date(HERE / 'changelog.src.html') or today, log_date)),
        (f'{site_url}/privacy.html', seo.git_date(HERE / 'privacy.src.html') or today)] + \
       [(f'{site_url}/{p["file"]}', seo.page_date(p['file'], cfg, today)) for p in published]
(HERE / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    ''.join(f'  <url><loc>{u}</loc><lastmod>{min(d, today)}</lastmod></url>\n' for u, d in urls) + '</urlset>\n', encoding='utf-8')
# разметка курса для поисковиков на главной: Course + список опубликованных уроков
index_html = (HERE / 'index.html').read_text(encoding='utf-8')
if 'application/ld+json' not in index_html:
    names = {}
    for p in published:
        f = HERE / p['file']
        if f.exists():
            m = re.search(r'<title>(.*?)</title>', f.read_text(encoding='utf-8'), flags=re.S)
            if m:
                names[p['file']] = m.group(1).split(' — ')[0].strip()
    desc = re.search(r'<meta name="description" content="([^"]*)">', index_html)
    index_html = index_html.replace('</head>', seo.course_ld(site_url, desc.group(1) if desc else '', published, names) + '</head>', 1)
    (HERE / 'index.html').write_text(index_html, encoding='utf-8')
(HERE / 'robots.txt').write_text(f'User-agent: *\nAllow: /\nSitemap: {site_url}/sitemap.xml\n', encoding='utf-8')
print(f'sitemap.xml: {len(urls)} адресов, robots.txt')
if not cfg.get('THANKS_API'):
    print('THANKS_API не задан — кнопка «Сказать спасибо» работает без счётчика (см. server/thanks/deploy.sh)', file=sys.stderr)
if missing:
    print('Не заданы ссылки:', ', '.join(sorted(missing)), '— заполните config.json', file=sys.stderr)
