#!/usr/bin/env bash
# Субботний выпуск с Mac автора — запасной вариант без облака (решение 07.10.2026).
# В пятницу, после «да» автора: снимок репозитория кладётся вне ~/Documents (туда launchd без особых прав
# не пускает), и задание launchd каждые 10 минут проверяет, наступило ли 09:00 по Москве дня выпуска.
# Как только наступило — выкладывает сайт из снимка (tools/deploy.sh: уроки с этой датой появляются сами)
# и показывает уведомление. Mac должен быть включён и в сети; если он спал, выкладка пройдёт после пробуждения.
# Пост в канал автор публикует сам.
#   tools/release_mac.sh arm 2026-10-10        снимок + задание по расписанию
#   tools/release_mac.sh status                что запланировано и что в журнале
#   tools/release_mac.sh disarm                снять задание
#   tools/release_mac.sh run 2026-10-10 [--dryrun]   то, что делает задание (можно запустить вручную)
set -uo pipefail
CMD="${1:-}"; DAY="${2:-}"; DRY="${3:-}"
LABEL=ru.modernrobotics.release
HOME_DIR="$HOME/Library/Application Support/modernrobotics-release"
SNAP="$HOME_DIR/repo"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/modernrobotics-release.log"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" AWS_PROFILE="${AWS_PROFILE:-mr}"
say() { echo "$(TZ=Europe/Moscow date '+%d.%m %H:%M МСК') $*" | tee -a "$LOG"; }
notify() { osascript -e "display notification \"$1\" with title \"modernrobotics.ru\"" >/dev/null 2>&1 || true; }
check_day() { [[ "$DAY" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || { echo "дата в формате ГГГГ-ММ-ДД"; exit 2; }; }

case "$CMD" in
  arm)
    check_day; SRC="$(cd "$(dirname "$0")/.." && pwd)"
    mkdir -p "$HOME_DIR" "$(dirname "$LOG")" "$(dirname "$PLIST")"
    rsync -a --delete --exclude .git --exclude dist --exclude dist-release --exclude shots --exclude sources \
      --exclude node_modules --exclude __pycache__ --exclude site/lessons --exclude site/en "$SRC/" "$SNAP/"
    rm -f "$HOME_DIR/$DAY.done"
    cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$SNAP/tools/release_mac.sh</string><string>run</string><string>$DAY</string></array>
  <key>StartInterval</key><integer>600</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/modernrobotics-release.out</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/modernrobotics-release.out</string>
</dict></plist>
PL
    launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
    launchctl bootstrap "gui/$(id -u)" "$PLIST"
    say "запланирован выпуск $DAY в 09:00 МСК; снимок репозитория — $(cd "$SRC" && git log --oneline -1 2>/dev/null)"
    ;;
  run)
    check_day; cd "$(dirname "$0")/.."
    DONE="$HOME_DIR/$DAY.done"
    [ -f "$DONE" ] && exit 0
    NOW=$(TZ=Europe/Moscow date +%Y-%m-%dT%H:%M)
    if [[ "$NOW" < "${DAY}T09:00" ]] && [ "$DRY" != "--dryrun" ]; then exit 0; fi
    say "выкладываю выпуск $DAY${DRY:+ (пробный прогон)}"
    if bash tools/deploy.sh $DRY >> "$LOG" 2>&1; then
      if [ "$DRY" = "--dryrun" ]; then say "пробный прогон прошёл"; notify "Пробный прогон выпуска $DAY прошёл"; exit 0; fi
      date > "$DONE"; say "выпуск $DAY на сайте"; notify "Выпуск $DAY на сайте. Пора публиковать пост."
      launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
    else
      say "ошибка выкладки, повторю через 10 минут"; notify "Ошибка выкладки выпуска $DAY — повторю через 10 минут"
    fi
    ;;
  status)
    launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1 && echo "задание $LABEL запланировано" || echo "задания нет"
    ls "$HOME_DIR"/*.done 2>/dev/null | sed 's/^/выложено: /'
    [ -f "$LOG" ] && tail -n 15 "$LOG"
    ;;
  disarm)
    launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 && echo "задание снято" || echo "задания не было"
    rm -f "$PLIST"
    ;;
  *) sed -n '2,13p' "$0"; exit 2 ;;
esac
