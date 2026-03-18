#!/usr/bin/env bash

set -e

BASE_URL="http://localhost:3000"
EMAIL="admin@test.com"
PASSWORD="1234"
SESSION_TITLE="Автотест шага 4 — вопросы"

echo "1) Логин..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

echo "$LOGIN_RESPONSE"
TOKEN=$(printf '%s' "$LOGIN_RESPONSE" | python3 -c 'import sys, json; print(json.load(sys.stdin).get("token",""))')

if [ -z "$TOKEN" ]; then
  echo ""
  echo "Ошибка: не удалось получить token."
  exit 1
fi

echo ""
echo "2) Создание сессии с вопросами..."
CREATE_RESPONSE=$(curl -s -X POST "$BASE_URL/sessions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "'"$SESSION_TITLE"'",
    "deckId": "deck1",
    "cardMode": "full_deck",
    "maxCardsOnScreen": 1,
    "timerEnabled": true,
    "timerMinutes": 3,
    "questions": ["Первый вопрос", "Второй вопрос", "Третий вопрос"]
  }')

echo "$CREATE_RESPONSE"
SESSION_ID=$(printf '%s' "$CREATE_RESPONSE" | python3 -c 'import sys, json; print(json.load(sys.stdin).get("session",{}).get("id",""))')

if [ -z "$SESSION_ID" ]; then
  echo ""
  echo "Ошибка: не удалось получить SESSION_ID."
  exit 1
fi

echo ""
echo "3) Запуск сессии..."
START_RESPONSE=$(curl -s -X POST "$BASE_URL/sessions/$SESSION_ID/start" \
  -H "Authorization: Bearer $TOKEN")
echo "$START_RESPONSE"

echo ""
echo "4) Получение текущего вопроса..."
GET_QUESTIONS_RESPONSE=$(curl -s "$BASE_URL/screen/$SESSION_ID/questions" \
  -H "Authorization: Bearer $TOKEN")
echo "$GET_QUESTIONS_RESPONSE"

echo ""
echo "5) Переключение на следующий вопрос..."
NEXT_RESPONSE=$(curl -s -X POST "$BASE_URL/screen/$SESSION_ID/questions/next" \
  -H "Authorization: Bearer $TOKEN")
echo "$NEXT_RESPONSE"

echo ""
echo "6) Возврат на предыдущий вопрос..."
PREV_RESPONSE=$(curl -s -X POST "$BASE_URL/screen/$SESSION_ID/questions/prev" \
  -H "Authorization: Bearer $TOKEN")
echo "$PREV_RESPONSE"

echo ""
echo "7) Повторная проверка текущего вопроса..."
GET_QUESTIONS_RESPONSE_2=$(curl -s "$BASE_URL/screen/$SESSION_ID/questions" \
  -H "Authorization: Bearer $TOKEN")
echo "$GET_QUESTIONS_RESPONSE_2"

echo ""
echo "Готово."
echo "SESSION_ID: $SESSION_ID"
