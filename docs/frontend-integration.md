# Инструкция Для Фронтенда

Эта инструкция описывает только актуальные роуты, которые фронтенд должен использовать для игры.

Базовый URL API:

```text
http://localhost:3001/api
```

## 1. Главное правило авторизации

Для всех защищённых запросов нужно передавать Telegram `initData` только в заголовке:

```http
X-Telegram-Init-Data: <initData>
```

Важно:

- `initData` нельзя передавать в `body`
- `initData` нельзя передавать в `query`
- сервер читает игрока именно из `initData`
- bearer token сейчас не используется как основной способ доступа к игровым методам

## 2. Какие роуты использовать

Фронту нужны только эти методы:

### Auth

- `POST /api/auth/session`
- `DELETE /api/auth/current`

### Game

- `POST /api/game/start-session`
- `POST /api/game/activity-log`
- `POST /api/game/found-sneaker`
- `POST /api/game/finish`

## 3. Общая последовательность работы

При открытии миниаппа:

1. Получить `initData` из Telegram WebApp
2. Если есть реферальный параметр, подготовить `referralCode`
3. Вызвать `POST /api/auth/session`
4. Сохранить ответ `player`
5. Взять `session`, `lifecycle`, `reason` из ответа `POST /api/auth/session`
6. По `lifecycle` решить, какой экран показывать

Во время игры:

1. Один раз вызвать `POST /api/game/start-session`
2. Регулярно слать `POST /api/game/activity-log`
3. При нахождении пары слать `POST /api/game/found-sneaker`
4. Когда все 10 пар собраны, вызвать `POST /api/game/finish`

## 4. Детально по каждому роуту

### 4.1 `POST /api/auth/session`

Зачем нужен:

- создаёт или обновляет игрока в базе
- определяет, новый это игрок или уже существующий
- сохраняет реферальный входящий код
- возвращает данные игрока для интерфейса
- сразу возвращает текущее состояние игры

Когда вызывать:

- всегда при старте миниаппа

Заголовки:

```http
X-Telegram-Init-Data: <initData>
Content-Type: application/json
```

Тело запроса:

```json
{
  "referralCode": "https://t.me/lamoda_games_bot/search?startapp=PLAYER42"
}
```

Что можно передать в `referralCode`:

- `PLAYER42`
- `player42`
- полную ссылку вида `https://t.me/lamoda_games_bot/search?startapp=PLAYER42`

Что делает сервер:

- достаёт пользователя из `initData`
- создаёт игрока, если это первый вход
- обновляет игрока, если он уже есть
- генерирует личный `referralCode`
- собирает `referralLink`
- если был входящий реферал, ставит `hasReferral: true`

Пример ответа:

```json
{
  "data": {
    "token": "0d4d0c1f-7d3b-4f35-bc4e-6e1a0bb3fd2c",
    "expiresAt": "2026-06-11T12:00:00.000Z",
    "player": {
      "id": 7,
      "telegramUserId": 123456789,
      "username": "player_one",
      "displayName": "Alex Player",
      "authProvider": "telegram_unverified",
      "referralCode": "A1B2C3D4E5F6",
      "referredByCode": "PLAYER42",
      "referralLink": "https://t.me/lamoda_games_bot/search?startapp=A1B2C3D4E5F6",
      "hasReferral": true,
      "isOnline": true,
      "lastSeenAt": "2026-05-12T12:00:00.000Z",
      "isExisting": false
    },
    "session": {
      "id": 15,
      "status": "active",
      "remainingSeconds": 587,
      "foundSneakers": [
        { "sneakerNumber": 1, "found": true },
        { "sneakerNumber": 2, "found": true },
        { "sneakerNumber": 3, "found": false }
      ],
      "pauseCount": 0,
      "startedAt": "2026-05-12T10:00:00.000Z",
      "lastResumedAt": "2026-05-12T10:00:00.000Z",
      "lastPausedAt": null,
      "lastHeartbeatAt": "2026-05-12T10:00:10.000Z",
      "finishedAt": null,
      "expiredAt": null,
      "canCollect": true,
      "isOnline": true
    },
    "lifecycle": "active",
    "reason": null
  }
}
```

Что фронту важно взять из ответа:

- `player.id`
- `player.displayName`
- `player.hasReferral`
- `player.referralCode`
- `player.referralLink`
- `player.isExisting`
- `session`
- `lifecycle`
- `reason`

Примечание:

- `token` сервер всё ещё возвращает, но игровая авторизация дальше идёт по `initData`

### 4.2 `DELETE /api/auth/current`

Зачем нужен:

- удаляет текущего игрока из базы
- полезен для отладки и ручного сброса

Когда вызывать:

- только если нужен полный сброс игрока
- в обычном игровом flow обычно не нужен

Заголовки:

```http
X-Telegram-Init-Data: <initData>
```

Тело запроса:

- не нужно

Пример ответа:

```json
{
  "data": {
    "deleted": true
  }
}
```

### 4.3 `POST /api/game/start-session`

Зачем нужен:

- запускает новую игровую сессию
- если у игрока уже есть открытая сессия, сервер вернёт её
- если `remainingSeconds > 0`, сервер резюмирует таймер
- если `remainingSeconds = 0`, сервер не запускает таймер заново

Когда вызывать:

- когда игрок нажал кнопку старта
- когда нужно войти в текущую сессию
- при любом повторном входе в игровой экран

Заголовки:

```http
X-Telegram-Init-Data: <initData>
Content-Type: application/json
```

Тело запроса:

```json
{}
```

Важно:

- новую сессию нельзя стартовать с заранее найденными кроссовками
- сервер всегда начинает новую игру только с:

```json
[1]
```

То есть:

- всего кроссовок `10`
- первый кроссовок открыт по умолчанию
- остальные находятся только через `found-sneaker`

Пример ответа:

```json
{
  "data": {
    "session": {
      "id": 15,
      "status": "active",
      "remainingSeconds": 600,
      "foundSneakers": [
        { "sneakerNumber": 1, "found": true },
        { "sneakerNumber": 2, "found": false },
        { "sneakerNumber": 3, "found": false }
      ],
      "pauseCount": 0,
      "startedAt": "2026-05-12T10:00:00.000Z",
      "lastResumedAt": "2026-05-12T10:00:00.000Z",
      "lastPausedAt": null,
      "lastHeartbeatAt": "2026-05-12T10:00:00.000Z",
      "finishedAt": null,
      "expiredAt": null,
      "canCollect": true,
      "isOnline": true
    },
    "lifecycle": "active",
    "reason": "new-session"
  }
}
```

Возможные `reason`:

- `new-session` — создана новая сессия
- `existing-session` — уже была активная сессия

### 4.4 `POST /api/game/activity-log`

Зачем нужен:

- сообщает серверу, что игрок онлайн и активен
- пишет игровой лог
- обновляет `lastHeartbeatAt`
- не дает таймеру заморозиться

Когда вызывать:

- регулярно во время игры
- на любые заметные игровые действия
- можно слать heartbeat-подобный ping через этот же метод

Заголовки:

```http
X-Telegram-Init-Data: <initData>
Content-Type: application/json
```

Тело запроса:

```json
{
  "source": "unity",
  "action": "swipe",
  "details": {
    "direction": "left"
  }
}
```

Что означают поля:

- `source` — откуда пришло событие
- `action` — какое именно действие произошло
- `details` — любые дополнительные данные

Примеры `source`:

- `unity`
- `webapp`
- `client`

Примеры `action`:

- `click`
- `swipe`
- `open-screen`
- `close-screen`
- `presence-ping`
- `collect-sneaker`

Пример ответа:

```json
{
  "data": {
    "logged": true,
    "activityLog": {
      "id": 99,
      "playerId": 5,
      "gameSessionId": 25,
      "source": "unity",
      "action": "swipe",
      "details": {
        "direction": "left"
      },
      "createdAt": "2026-05-12T10:00:05.000Z"
    },
    "session": {
      "id": 25,
      "status": "active",
      "remainingSeconds": 540,
      "foundSneakers": [
        { "sneakerNumber": 1, "found": true },
        { "sneakerNumber": 2, "found": true },
        { "sneakerNumber": 3, "found": false }
      ],
      "pauseCount": 0,
      "startedAt": "2026-05-12T10:00:00.000Z",
      "lastResumedAt": "2026-05-12T10:00:00.000Z",
      "lastPausedAt": null,
      "lastHeartbeatAt": "2026-05-12T10:00:05.000Z",
      "finishedAt": null,
      "expiredAt": null,
      "canCollect": true,
      "isOnline": true
    },
    "lifecycle": "active"
  }
}
```

Важно:

- если activity-логов нет дольше `15 секунд`, игрок считается не онлайн
- если activity-логов нет дольше grace-окна, таймер перестает уменьшаться, пока активность не вернется

### 4.5 `POST /api/game/found-sneaker`

Зачем нужен:

- отмечает найденный кроссовок
- обновляет серверный список найденных пар

Когда вызывать:

- каждый раз, когда игрок реально находит кроссовок

Заголовки:

```http
X-Telegram-Init-Data: <initData>
Content-Type: application/json
```

Тело запроса:

```json
{
  "sneakerNumber": 4
}
```

Ограничения:

- `sneakerNumber` должен быть числом от `1` до `10`

Пример ответа при успешном добавлении:

```json
{
  "data": {
    "accepted": true,
    "session": {
      "id": 15,
      "status": "active",
      "remainingSeconds": 540,
      "foundSneakers": [
        { "sneakerNumber": 1, "found": true },
        { "sneakerNumber": 2, "found": false },
        { "sneakerNumber": 3, "found": false },
        { "sneakerNumber": 4, "found": true }
      ],
      "pauseCount": 0,
      "startedAt": "2026-05-12T10:00:00.000Z",
      "lastResumedAt": "2026-05-12T10:00:00.000Z",
      "lastPausedAt": null,
      "lastHeartbeatAt": "2026-05-12T10:01:00.000Z",
      "finishedAt": null,
      "expiredAt": null,
      "canCollect": true,
      "isOnline": true
    },
    "lifecycle": "active"
  }
}
```

Пример ответа, если этот кроссовок уже был найден:

```json
{
  "data": {
    "accepted": false,
    "session": {
      "id": 15,
      "status": "active",
      "remainingSeconds": 540,
      "foundSneakers": [
        { "sneakerNumber": 1, "found": true },
        { "sneakerNumber": 2, "found": false },
        { "sneakerNumber": 3, "found": false },
        { "sneakerNumber": 4, "found": true }
      ],
      "pauseCount": 0,
      "startedAt": "2026-05-12T10:00:00.000Z",
      "lastResumedAt": "2026-05-12T10:00:00.000Z",
      "lastPausedAt": null,
      "lastHeartbeatAt": "2026-05-12T10:01:00.000Z",
      "finishedAt": null,
      "expiredAt": null,
      "canCollect": true,
      "isOnline": true
    },
    "lifecycle": "active"
  }
}
```

Что важно фронту:

- всегда брать актуальный список из `session.foundSneakers`
- не пытаться доверять только локальному состоянию

### 4.6 `POST /api/game/finish`

Зачем нужен:

- завершает игру
- фиксирует итоговую попытку

Когда вызывать:

- когда собраны все 10 кроссовок

Заголовки:

```http
X-Telegram-Init-Data: <initData>
```

Тело запроса:

- не нужно

Условия успешного завершения:

- сессия должна быть `active`
- время не должно истечь
- должно быть найдено `10` кроссовок

Пример ответа:

```json
{
  "data": {
    "session": {
      "id": 15,
      "status": "finished",
      "remainingSeconds": 120,
      "foundSneakers": [
        { "sneakerNumber": 1, "found": true },
        { "sneakerNumber": 2, "found": true },
        { "sneakerNumber": 3, "found": true },
        { "sneakerNumber": 4, "found": true },
        { "sneakerNumber": 5, "found": true },
        { "sneakerNumber": 6, "found": true },
        { "sneakerNumber": 7, "found": true },
        { "sneakerNumber": 8, "found": true },
        { "sneakerNumber": 9, "found": true },
        { "sneakerNumber": 10, "found": true }
      ],
      "pauseCount": 0,
      "startedAt": "2026-05-12T10:00:00.000Z",
      "lastResumedAt": null,
      "lastPausedAt": "2026-05-12T10:08:00.000Z",
      "lastHeartbeatAt": "2026-05-12T10:07:55.000Z",
      "finishedAt": "2026-05-12T10:08:00.000Z",
      "expiredAt": null,
      "canCollect": false,
      "isOnline": true
    },
    "lifecycle": "finished",
    "reason": "completed"
  }
}
```

Что делать на фронте после ответа:

- показать финальный экран
- зафиксировать, что попытка завершена
- не давать собирать новые кроссовки в этой сессии

## 5. Типичные ошибки

### Нет `initData` в заголовке

Пример ответа:

```json
{
  "error": {
    "message": "Telegram initData header is required",
    "details": null
  }
}
```

### `initData` передали в body или query

Пример ответа:

```json
{
  "error": {
    "message": "Telegram initData must be sent only in headers",
    "details": null
  }
}
```

### Попытка завершить игру раньше времени

Пример ответа:

```json
{
  "error": {
    "message": "Collect all sneakers before finishing the game",
    "details": null
  }
}
```

### Время закончилось

Пример ответа:

```json
{
  "error": {
    "message": "Time is over",
    "details": null
  }
}
```

## 6. Что фронту лучше не делать

- не хранить найденные кроссовки как единственный источник истины только на клиенте
- не стартовать игру с предзаполненными найденными парами
- не передавать `initData` в `body`
- не использовать старые методы `pause`, `resume`, `heartbeat`, `start`

## 7. Короткий рабочий сценарий

Минимальный сценарий для фронта:

1. `POST /api/auth/session`
2. `POST /api/game/start-session`
3. во время игры слать `POST /api/game/activity-log`
4. при находке пары слать `POST /api/game/found-sneaker`
5. после 10 из 10 слать `POST /api/game/finish`
