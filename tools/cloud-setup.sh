#!/usr/bin/env bash
# Настройка Yandex Cloud для modernrobotics.ru через yc. Каждый шаг можно запускать повторно.
# Перед первым запуском: yc init (вход в облако и выбор каталога курса).
#   tools/cloud-setup.sh buckets     бакеты modernrobotics.ru (хостинг, публичное чтение) и www.modernrobotics.ru (переадресация)
#   tools/cloud-setup.sh dns         зона modernrobotics.ru.: ANAME на бакет, CNAME для www.
#                                    Затем у регистратора — DNS-серверы ns1.yandexcloud.net и ns2.yandexcloud.net
#   tools/cloud-setup.sh cert        сертификат Let's Encrypt на оба имени и CNAME-записи для проверки прав на домен
#   tools/cloud-setup.sh https       когда сертификат выпущен — привязать его к обоим бакетам
#   tools/cloud-setup.sh deploy-key  сервисный аккаунт site-deploy с правом записи в бакет сайта; его ключ сразу
#                                    записывается в профиль AWS CLI «mr» (~/.aws) и нигде не печатается
#   tools/cloud-setup.sh status      что уже создано
# Счётчик «Сказать спасибо» — отдельно: server/thanks/deploy.sh. Подробности — заметка «Курс Physical AI — хостинг в Yandex Cloud».
set -euo pipefail
D=modernrobotics.ru; ZONE=modernrobotics-ru; CERT=modernrobotics-ru; SA=site-deploy
[ -n "$(yc config get folder-id 2>/dev/null)" ] || { echo 'Сначала yc init: вход в облако и выбор каталога'; exit 1; }
field() { python3 -c "import json,sys; d = json.load(sys.stdin); print(d$1)"; }
cert_id() { yc certificate-manager certificate get --name "$CERT" --format json | field '["id"]'; }

buckets() {
  yc storage bucket get --name "$D" >/dev/null 2>&1 || yc storage bucket create --name "$D" --default-storage-class standard >/dev/null
  yc storage bucket update --name "$D" --public-read --public-list --website-settings '{"index": "index.html", "error": "404.html"}' >/dev/null
  yc storage bucket get --name "www.$D" >/dev/null 2>&1 || yc storage bucket create --name "www.$D" --default-storage-class standard >/dev/null
  yc storage bucket update --name "www.$D" --public-read --website-settings "{\"redirectAllRequests\": {\"protocol\": \"PROTOCOL_HTTPS\", \"hostname\": \"$D\"}}" >/dev/null
  echo "Бакеты готовы. До HTTPS сайт виден по адресу http://$D.website.yandexcloud.net"
}

dns() {
  yc dns zone get --name "$ZONE" >/dev/null 2>&1 || yc dns zone create --name "$ZONE" --zone "$D." --public-visibility >/dev/null
  yc dns zone add-records --name "$ZONE" --record "$D. 600 ANAME $D.website.yandexcloud.net." >/dev/null
  yc dns zone add-records --name "$ZONE" --record "www.$D. 600 CNAME www.$D.website.yandexcloud.net." >/dev/null
  echo "Зона $D. готова. Теперь у регистратора: DNS-серверы ns1.yandexcloud.net и ns2.yandexcloud.net, остальные удалить."
}

cert() {
  yc certificate-manager certificate get --name "$CERT" >/dev/null 2>&1 ||
    yc certificate-manager certificate request --name "$CERT" --domains "$D,www.$D" --challenge dns >/dev/null
  local id; id=$(cert_id)
  for h in "$D" "www.$D"; do
    yc dns zone add-records --name "$ZONE" --record "_acme-challenge.$h. 600 CNAME $id.cm.yandexcloud.net." >/dev/null
  done
  echo "Сертификат запрошен, записи для проверки добавлены. Статус: $(yc certificate-manager certificate get --name "$CERT" --format json | field '["status"]')"
  echo "Выпуск — от получаса до нескольких часов после делегирования домена. Потом: tools/cloud-setup.sh https"
}

https() {
  local st; st=$(yc certificate-manager certificate get --name "$CERT" --format json | field '["status"]')
  [ "$st" = ISSUED ] || { echo "Сертификат ещё не выпущен (статус $st). Повтори позже."; exit 1; }
  for b in "$D" "www.$D"; do yc storage bucket set-https --name "$b" --certificate-id "$(cert_id)" >/dev/null; done
  echo "HTTPS включён на обоих бакетах, заработает в течение получаса: https://$D"
}

deploy_key() {
  yc iam service-account get "$SA" >/dev/null 2>&1 || yc iam service-account create --name "$SA" --description "Выкладка сайта $D" >/dev/null
  local sa; sa=$(yc iam service-account get "$SA" --format json | field '["id"]')
  yc storage bucket update --name "$D" \
    --grants "grant-type=grant-type-account,grantee-id=$sa,permission=permission-write" \
    --grants "grant-type=grant-type-account,grantee-id=$sa,permission=permission-read" >/dev/null
  if [ -n "$(aws configure get aws_access_key_id --profile mr 2>/dev/null)" ]; then
    echo "Профиль AWS CLI «mr» уже настроен, новый ключ не создаю."; return
  fi
  yc iam access-key create --service-account-name "$SA" --description "AWS CLI для tools/deploy.sh" --format json | python3 -c '
import configparser, json, os, pathlib, sys
k = json.load(sys.stdin)
home = pathlib.Path.home() / ".aws"; home.mkdir(mode=0o700, exist_ok=True)
def put(name, section, values):
    p = home / name; c = configparser.ConfigParser(); c.read(p)
    c[section] = values
    with open(p, "w") as f: c.write(f)
    os.chmod(p, 0o600)
put("credentials", "mr", {"aws_access_key_id": k["access_key"]["key_id"], "aws_secret_access_key": k["secret"]})
put("config", "profile mr", {"region": "ru-central1", "endpoint_url": "https://storage.yandexcloud.net",
    "request_checksum_calculation": "when_required", "response_checksum_validation": "when_required"})
print("Ключ записан в ~/.aws, профиль mr. Секрет не выводился.")'
}

status() {
  echo "Бакеты:      $(yc storage bucket list --format json | python3 -c 'import json,sys; print(", ".join(b["name"] for b in json.load(sys.stdin)) or "нет")')"
  echo "Зона DNS:    $(yc dns zone get --name "$ZONE" --format json 2>/dev/null | field '["zone"]' 2>/dev/null || echo нет)"
  echo "Сертификат:  $(yc certificate-manager certificate get --name "$CERT" --format json 2>/dev/null | field '["status"]' 2>/dev/null || echo нет)"
  echo "Делегирование: $(dig +short NS "$D" | tr '\n' ' ')"
  echo "Счётчик:     $(yc serverless function get mr-thanks --format json 2>/dev/null | field '["id"]' 2>/dev/null || echo 'нет — server/thanks/deploy.sh')"
}

case "${1:-status}" in
  buckets) buckets ;; dns) dns ;; cert) cert ;; https) https ;; deploy-key) deploy_key ;; status) status ;;
  *) sed -n '2,12p' "$0"; exit 1 ;;
esac
