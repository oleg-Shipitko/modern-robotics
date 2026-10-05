#!/usr/bin/env bash
# Выкладка сайта в Yandex Object Storage (бакет modernrobotics.ru).
# Собирает уроки и страницы, складывает в dist/ только опубликованное (список — site/config.json, PUBLISHED)
# и синхронизирует с бакетом через AWS CLI. Ключи — в профиле AWS «mr» (~/.aws), см. заметку
# «Курс Physical AI — хостинг в Yandex Cloud».
#   tools/deploy.sh --build-only   только собрать dist/
#   tools/deploy.sh --dryrun       показать, что будет загружено и удалено
#   tools/deploy.sh                выложить
set -euo pipefail
cd "$(dirname "$0")/.."
MODE="${1:-}"
BUCKET="s3://modernrobotics.ru"
export AWS_PROFILE="${AWS_PROFILE:-mr}"

python3 lessons/build.py all
python3 site/build.py
python3 - <<'PY'
import json, pathlib, shutil
root = pathlib.Path('.'); site = root / 'site'; dist = root / 'dist'
cfg = json.loads((site / 'config.json').read_text(encoding='utf-8'))
if dist.exists(): shutil.rmtree(dist)
dist.mkdir()
for f in ['index.html', 'about.html', '404.html', 'robots.txt', 'sitemap.xml']:
    shutil.copy2(site / f, dist / f)
shutil.copytree(site / 'assets', dist / 'assets', ignore=shutil.ignore_patterns('sprite.svg.html', '.*'))
(dist / 'lessons').mkdir()
for p in cfg['PUBLISHED']:
    src = site / p['file']
    if not src.exists(): raise SystemExit(f'Урок {p["n"]} не собран: {src}')
    shutil.copy2(src, dist / p['file'])
files = [x for x in dist.rglob('*') if x.is_file()]
print(f'dist/: {len(files)} файлов, {sum(x.stat().st_size for x in files) / 1e6:.1f} МБ, уроков: {len(cfg["PUBLISHED"])}')
if not cfg.get('THANKS_API'): print('ВНИМАНИЕ: THANKS_API пуст — на сайте не будет числа у кнопки «Сказать спасибо». Сначала server/thanks/deploy.sh')
# ссылки из опубликованных уроков на ещё не опубликованные уроки
import re
pub = {pathlib.Path(q['file']).name for q in cfg['PUBLISHED']}
for q in cfg['PUBLISHED']:
    for ref in sorted(set(re.findall(r'href="([0-9]-[0-9]-[a-z0-9-]+\.html)', (dist / q['file']).read_text(encoding='utf-8')))):
        if ref not in pub: print(f'ВНИМАНИЕ: урок {q["n"]} ссылается на неопубликованный {ref}')
PY
[ "$MODE" = "--build-only" ] && exit 0

DRY=""; [ "$MODE" = "--dryrun" ] && DRY="--dryrun"
EP="--endpoint-url https://storage.yandexcloud.net"
S="aws s3 sync dist/ $BUCKET $EP --delete $DRY"
# html — браузер сверяется с сервером при каждом заходе
$S --exclude "*" --include "*.html" --content-type "text/html; charset=utf-8" --cache-control "no-cache"
# стили и скрипты
$S --exclude "*" --include "*.css" --content-type "text/css; charset=utf-8" --cache-control "max-age=3600"
$S --exclude "*" --include "*.js" --content-type "text/javascript; charset=utf-8" --cache-control "max-age=3600"
# шрифты не меняются — кэш надолго
$S --exclude "*" --include "*.woff2" --content-type "font/woff2" --cache-control "max-age=31536000, immutable"
# всё остальное: картинки, svg, robots.txt, sitemap.xml — тип по расширению
$S --exclude "*.html" --exclude "*.css" --exclude "*.js" --exclude "*.woff2" --cache-control "max-age=3600"
[ -n "$DRY" ] && echo "Пробный прогон: ничего не выложено" || echo "Готово: https://modernrobotics.ru"
