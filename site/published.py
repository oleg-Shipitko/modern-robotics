"""Что опубликовано на момент сборки. Запись PUBLISHED в site/config.json с полем "date" (ГГГГ-ММ-ДД)
выходит в этот день в 09:00 по Москве — так устроены субботние выпуски (tools/release.py); запись без
даты опубликована всегда. Момент сборки задаёт переменная MR_ASOF: дата — это 09:00 по Москве того дня
(так собирается выпуск заранее), без неё — текущее время.
"""
import datetime
import os

MSK = datetime.timezone(datetime.timedelta(hours=3))
RELEASE_HOUR = 9


def release_moment(day):
    return datetime.datetime.fromisoformat(day).replace(hour=RELEASE_HOUR, tzinfo=MSK)


def asof():
    day = os.environ.get('MR_ASOF', '')
    return release_moment(day) if day else datetime.datetime.now(MSK)


def published(cfg, moment=None):
    moment = moment or asof()
    return [p for p in cfg.get('PUBLISHED', []) if not p.get('date') or release_moment(p['date']) <= moment]
