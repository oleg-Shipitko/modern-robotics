#!/usr/bin/env bash
# Выкладка сайта в Yandex Object Storage (бакет modernrobotics.ru).
# Собирает уроки и страницы, складывает в dist/ только опубликованное на текущий момент (site/config.json,
# PUBLISHED; уроки субботних выпусков появляются в 09:00 дня выпуска — site/published.py) и синхронизирует
# с бакетом через AWS CLI. Ключи — в профиле AWS «mr» (~/.aws), см. заметку «Курс Physical AI — хостинг в Yandex Cloud».
#   tools/deploy.sh --build-only   только собрать dist/
#   tools/deploy.sh --dryrun       показать, что будет загружено и удалено
#   tools/deploy.sh                выложить
#   tools/deploy.sh --force        выложить, даже если со страниц сайта пропадут уроки (см. защиту ниже)
# После выкладки пересобираются подготовленные, но ещё не вышедшие субботние выпуски (tools/release.py refresh),
# чтобы в субботу на сайт не вернулись старые версии страниц.
set -euo pipefail
cd "$(dirname "$0")/.."
MODE="${1:-}"
BUCKET="s3://modernrobotics.ru"
export AWS_PROFILE="${AWS_PROFILE:-mr}"

python3 tools/assemble.py dist
[ "$MODE" = "--build-only" ] && exit 0

# Защита: урок, который уже есть на сайте (например, вышел в субботу), не должен пропасть из-за sync --delete
if [ "$MODE" != "--force" ]; then
  aws s3 ls "$BUCKET/lessons/" --endpoint-url https://storage.yandexcloud.net | awk '{print $4}' | python3 -c '
import pathlib, sys
live = {l.strip() for l in sys.stdin if l.strip().endswith(".html")}
gone = sorted(live - {p.name for p in pathlib.Path("dist/lessons").glob("*.html")})
if gone:
    print("СТОП: эти страницы уже на сайте, но в сборке их нет, и выкладка их удалит:", *gone, sep="\n  ")
    print("Проверь даты в site/config.json (PUBLISHED). Если страницы и правда нужно убрать — tools/deploy.sh --force")
    sys.exit(1)'
fi

DRY=""; [ "$MODE" = "--dryrun" ] && DRY="--dryrun"
tools/s3sync.sh dist/ "$BUCKET" $DRY
if [ -n "$DRY" ]; then echo "Пробный прогон: ничего не выложено"; exit 0; fi
echo "Готово: https://modernrobotics.ru"
python3 tools/release.py refresh
