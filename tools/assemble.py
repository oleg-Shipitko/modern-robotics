#!/usr/bin/env python3
"""Собирает сайт в папку для выкладки: уроки, страницы сайта и только то, что опубликовано на момент
сборки (site/config.json, PUBLISHED; даты выпусков — site/published.py).
  python3 tools/assemble.py dist                       — сайт сейчас (так его выкладывает tools/deploy.sh);
  MR_ASOF=2026-10-10 python3 tools/assemble.py out     — каким он станет в 09:00 этого дня (tools/release.py).
"""
import json, os, pathlib, re, shutil, subprocess, sys

root = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / 'site'))
from published import asof, published  # noqa: E402

dist = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'dist').resolve()
subprocess.run([sys.executable, str(root / 'lessons/build.py'), 'all'], check=True, stdout=subprocess.DEVNULL)
subprocess.run([sys.executable, str(root / 'site/build.py')], check=True, stdout=subprocess.DEVNULL)
site = root / 'site'
cfg = json.loads((site / 'config.json').read_text(encoding='utf-8'))
pub = published(cfg)
if dist.exists():
    shutil.rmtree(dist)
dist.mkdir(parents=True)
for f in ['index.html', 'about.html', '404.html', 'robots.txt', 'sitemap.xml']:
    shutil.copy2(site / f, dist / f)
shutil.copytree(site / 'assets', dist / 'assets', ignore=shutil.ignore_patterns('sprite.svg.html', '.*'))
(dist / 'lessons').mkdir()
for p in pub:
    src = site / p['file']
    if not src.exists():
        raise SystemExit(f'Урок {p["n"]} не собран: {src}')
    shutil.copy2(src, dist / p['file'])
files = [x for x in dist.rglob('*') if x.is_file()]
moment = asof().strftime('%d.%m.%Y %H:%M')
print(f'{dist.name}/: {len(files)} файлов, {sum(x.stat().st_size for x in files) / 1e6:.1f} МБ, страниц уроков: {len(pub)} (на {moment} МСК)')
if not cfg.get('THANKS_API'):
    print('ВНИМАНИЕ: THANKS_API пуст — на сайте не будет числа у кнопки «Сказать спасибо». Сначала server/thanks/deploy.sh')
# ссылки из опубликованных страниц на ещё не опубликованные
names = {pathlib.Path(q['file']).name for q in pub}
for q in pub:
    for ref in sorted(set(re.findall(r'href="((?:[0-9]-[0-9]{1,2}-[a-z0-9-]+|proverka-chasti-\d+|glossariy)\.html)', (dist / q['file']).read_text(encoding='utf-8')))):
        if ref not in names:
            print(f'ВНИМАНИЕ: {q["n"]} ссылается на неопубликованную страницу {ref}')
