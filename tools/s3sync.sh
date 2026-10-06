#!/usr/bin/env bash
# Синхронизация собранного сайта с бакетом или папкой в бакете: Content-Type и Cache-Control по типу файла,
# лишнее в месте назначения удаляется. Ключи — профиль AWS «mr» (см. tools/deploy.sh).
#   tools/s3sync.sh dist/ s3://modernrobotics.ru [--dryrun]
#   tools/s3sync.sh dist-release/2026-10-10/ s3://modernrobotics-releases/2026-10-10/site
set -euo pipefail
SRC=$1; DST=$2; shift 2
export AWS_PROFILE="${AWS_PROFILE:-mr}"
S="aws s3 sync $SRC $DST --endpoint-url https://storage.yandexcloud.net --delete --no-progress $*"
# html — браузер сверяется с сервером при каждом заходе
$S --exclude "*" --include "*.html" --content-type "text/html; charset=utf-8" --cache-control "no-cache"
# стили и скрипты
$S --exclude "*" --include "*.css" --content-type "text/css; charset=utf-8" --cache-control "max-age=3600"
$S --exclude "*" --include "*.js" --content-type "text/javascript; charset=utf-8" --cache-control "max-age=3600"
# шрифты не меняются — кэш надолго
$S --exclude "*" --include "*.woff2" --content-type "font/woff2" --cache-control "max-age=31536000, immutable"
# всё остальное: картинки, svg, robots.txt, sitemap.xml — тип по расширению
$S --exclude "*.html" --exclude "*.css" --exclude "*.js" --exclude "*.woff2" --cache-control "max-age=3600"
