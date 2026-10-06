#!/usr/bin/env bash
# Анонимная статистика страниц курса в Yandex Cloud: две функции на базе и сервисном аккаунте счётчика «спасибо».
#   mr-stats         — публичная: принимает события со страниц сайта;
#   mr-stats-report  — закрытая: отдаёт суммы, её вызывает tools/stats.py через yc с правами владельца каталога.
# Сначала должен быть выложен счётчик (server/thanks/deploy.sh): база mr-thanks и аккаунт mr-thanks-fn общие.
# Повторный запуск выкладывает новую версию кода. В конце проверяет приём на служебной странице test
# и записывает адрес в site/config.json (STATS_API). Стоимость — в пределах бесплатного уровня.
# Логи: yc serverless function logs mr-stats
set -euo pipefail
cd "$(dirname "$0")"
DB=mr-thanks; SA=mr-thanks-fn; FN=mr-stats; REP=mr-stats-report; SITE=modernrobotics.ru
id_of() { python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])'; }

read -r YDB_ENDPOINT YDB_DATABASE < <(yc ydb database get "$DB" --format json |
  python3 -c 'import json,sys; e = json.load(sys.stdin)["endpoint"]; print(*e.split("/?database="))')
SA_ID=$(yc iam service-account get "$SA" --format json | id_of)
PKG=$(mktemp -d); cp index.py requirements.txt "$PKG"/
ENV="YDB_ENDPOINT=$YDB_ENDPOINT,YDB_DATABASE=$YDB_DATABASE,SITE=$SITE"

echo "1/3 Функция $FN (публичная)"
yc serverless function get "$FN" >/dev/null 2>&1 || yc serverless function create --name "$FN" --description "Анонимная статистика страниц $SITE" >/dev/null
yc serverless function version create --function-name "$FN" --runtime python312 --entrypoint index.handler \
  --memory 256MB --execution-timeout 10s --service-account-id "$SA_ID" --source-path "$PKG" --environment "$ENV" >/dev/null
yc serverless function allow-unauthenticated-invoke "$FN" >/dev/null
URL="https://functions.yandexcloud.net/$(yc serverless function get "$FN" --format json | id_of)"

echo "2/3 Функция $REP (закрытая, только через yc)"
yc serverless function get "$REP" >/dev/null 2>&1 || yc serverless function create --name "$REP" --description "Отчёт по статистике $SITE" >/dev/null
yc serverless function version create --function-name "$REP" --runtime python312 --entrypoint index.report \
  --memory 256MB --execution-timeout 30s --service-account-id "$SA_ID" --source-path "$PKG" --environment "$ENV" >/dev/null

echo "3/3 Проверка $URL на странице test"
for i in 1 2 3; do curl -fsS -X POST -H "Origin: https://$SITE" -H 'Content-Type: text/plain' --data '{"p":"test","e":["open:desk"]}' "$URL" && break || sleep 3; done; echo
curl -fsS -X POST -H "Origin: https://$SITE" -H 'Content-Type: text/plain' --data '{"p":"test","fb":{"r":"good","t":"проверка после выкладки"}}' "$URL"; echo
yc serverless function invoke "$REP" --data '{"days": 1}' | python3 -c '
import json, sys
d = json.load(sys.stdin); d = json.loads(d["body"]) if isinstance(d.get("body"), str) else d
n = sum(r["n"] for r in d["rows"] if r["page"] == "test")
f = sum(1 for r in d.get("feedback", []) if r["page"] == "test")
print("отчёт видит служебную страницу test:", n, "событий,", f, "отзывов"); sys.exit(0 if n and f else 1)'
python3 - "$URL" <<'PY'
import json, pathlib, sys
p = pathlib.Path('../../site/config.json'); cfg = json.loads(p.read_text(encoding='utf-8'))
cfg['STATS_API'] = sys.argv[1]
p.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('site/config.json: STATS_API =', sys.argv[1], '— теперь пересобери и выложи сайт: tools/deploy.sh')
PY
