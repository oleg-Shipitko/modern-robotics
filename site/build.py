#!/usr/bin/env python3
"""Сборка страниц сайта: подставляет SVG-спрайт, ссылки и список опубликованных уроков из config.json,
пишет robots.txt и sitemap.xml.
Запуск из папки site/:  python3 build.py
"""
import datetime, json, pathlib, re, shutil, sys

HERE = pathlib.Path(__file__).resolve().parent
cfg = json.loads((HERE / 'config.json').read_text(encoding='utf-8'))
sprite = (HERE / 'assets/sprite.svg.html').read_text(encoding='utf-8')
shutil.copyfile(HERE.parent / 'lessons/shared/kit.js', HERE / 'assets/hero/kit.js')  # один источник для сайта и уроков
for f in ('thanks.js', 'thanks.css', 'stats.js'):  # кнопка «Сказать спасибо» и анонимная статистика — общие с уроками
    shutil.copyfile(HERE.parent / 'lessons/shared' / f, HERE / 'assets' / f)

published = cfg.get('PUBLISHED', [])
vals = {k: v for k, v in cfg.items() if isinstance(v, str)}
vals['READY_JSON'] = json.dumps({p['n']: p['file'] for p in published}, ensure_ascii=False)
vals['THANKS_API_JSON'] = json.dumps(cfg.get('THANKS_API', ''))
vals['STATS_API_JSON'] = json.dumps(cfg.get('STATS_API', ''))
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
today = datetime.date.today().isoformat()
urls = [f'{site_url}/'] + [f'{site_url}/{p["file"]}' for p in published]
(HERE / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    ''.join(f'  <url><loc>{u}</loc><lastmod>{today}</lastmod></url>\n' for u in urls) + '</urlset>\n', encoding='utf-8')
(HERE / 'robots.txt').write_text(f'User-agent: *\nAllow: /\nSitemap: {site_url}/sitemap.xml\n', encoding='utf-8')
print(f'sitemap.xml: {len(urls)} адресов, robots.txt')
if not cfg.get('THANKS_API'):
    print('THANKS_API не задан — кнопка «Сказать спасибо» работает без счётчика (см. server/thanks/deploy.sh)', file=sys.stderr)
if missing:
    print('Не заданы ссылки:', ', '.join(sorted(missing)), '— заполните config.json', file=sys.stderr)
