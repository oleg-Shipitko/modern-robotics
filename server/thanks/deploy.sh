#!/usr/bin/env bash
# Счётчик «Сказать спасибо» в Yandex Cloud: база YDB serverless, сервисный аккаунт с доступом к ней и публичная функция.
# Нужен yc, настроенный на облако и каталог курса (yc init). Повторный запуск выкладывает новую версию кода.
# В конце проверяет счётчик test и записывает адрес функции в site/config.json (THANKS_API).
# Стоимость — в пределах бесплатного уровня: 1 млн вызовов функции и 1 млн RU базы в месяц.
# Логи функции: yc serverless function logs mr-thanks
set -euo pipefail
cd "$(dirname "$0")"
DB=mr-thanks; SA=mr-thanks-fn; FN=mr-thanks; SITE=modernrobotics.ru
id_of() { python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])'; }

echo "1/4 База YDB serverless $DB"
yc ydb database get "$DB" >/dev/null 2>&1 || yc ydb database create "$DB" --serverless --sls-storage-size 1GB --sls-throttling-rcu 30 >/dev/null
read -r YDB_ENDPOINT YDB_DATABASE < <(yc ydb database get "$DB" --format json |
  python3 -c 'import json,sys; e = json.load(sys.stdin)["endpoint"]; print(*e.split("/?database="))')

echo "2/4 Сервисный аккаунт $SA с ролью ydb.editor на эту базу"
yc iam service-account get "$SA" >/dev/null 2>&1 || yc iam service-account create --name "$SA" --description "Функция счётчика «Сказать спасибо»" >/dev/null
SA_ID=$(yc iam service-account get "$SA" --format json | id_of)
yc ydb database list-access-bindings "$DB" --format json | grep -q "$SA_ID" ||
  yc ydb database add-access-binding "$DB" --role ydb.editor --service-account-id "$SA_ID" >/dev/null

echo "3/4 Функция $FN"
yc serverless function get "$FN" >/dev/null 2>&1 || yc serverless function create --name "$FN" --description "Счётчик «Сказать спасибо» для $SITE" >/dev/null
PKG=$(mktemp -d); cp index.py requirements.txt "$PKG"/
yc serverless function version create --function-name "$FN" --runtime python312 --entrypoint index.handler \
  --memory 256MB --execution-timeout 10s --service-account-id "$SA_ID" --source-path "$PKG" \
  --environment "YDB_ENDPOINT=$YDB_ENDPOINT,YDB_DATABASE=$YDB_DATABASE,SITE=$SITE" >/dev/null
yc serverless function allow-unauthenticated-invoke "$FN" >/dev/null
URL="https://functions.yandexcloud.net/$(yc serverless function get "$FN" --format json | id_of)"

echo "4/4 Проверка $URL на счётчике test"
for i in 1 2 3; do curl -fsS "$URL?k=test" && break || sleep 3; done; echo
curl -fsS -X POST -H "Origin: https://$SITE" "$URL?k=test"; echo
python3 - "$URL" <<'PY'
import json, pathlib, sys
p = pathlib.Path('../../site/config.json'); cfg = json.loads(p.read_text(encoding='utf-8'))
cfg['THANKS_API'] = sys.argv[1]
p.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('site/config.json: THANKS_API =', sys.argv[1], '— теперь пересобери и выложи сайт: tools/deploy.sh')
PY
