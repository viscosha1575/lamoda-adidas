# Интеграция Фронтенда

Эта инструкция предназначена для фронтенд-разработчика, который подключает клиент к бэкенду из `server/`.

Базовый URL API:

```text
http://localhost:3001/api
```

## 1. Основные правила

- Сначала нужно создать auth-сессию.
- После этого сохранить `token`, который вернул сервер.
- Во все запросы `/api/game/*` передавать bearer token или `initData`.
- `initData` можно передавать только в заголовках.
- Реферал отправляется только при создании auth-сессии.
- Источник истины по игре на сервере: фронт должен опираться на `session`, `lifecycle` и `remainingSeconds` из ответа API.

## 2. Заголовок авторизации

Для защищённых запросов:

```http
Authorization: Bearer <token>
```

## 3. Последовательность при запуске приложения

Порядок действий на фронте:

1. Определить, есть ли реферальный параметр в Telegram или в URL.
2. Вызвать `POST /api/auth/session`.
3. Сохранить `token` из ответа.
4. Прочитать `player.hasReferral`.
5. Вызвать `GET /api/game/state`.
6. По `lifecycle` решить, какой экран показать.

## 4. Логика реферала

Реферал нужно передавать в `POST /api/auth/session` в поле `referralCode`.

Поддерживаемые примеры:

- `PLAYER42`
- `player42`
- `https://t.me/lamoda_games_bot/search?startapp=PLAYER42`

Что делает сервер:

- нормализует значение;
- если пришла ссылка `https://t.me/lamoda_games_bot/search?startapp=PLAYER42`, сохранит входящий код как `referredByCode = PLAYER42`;
- дополнительно создаст игроку его собственный `referralCode`;
- вернёт готовую `referralLink` для шаринга;
- если реферал был, у игрока станет `hasReferral: true`;
- если пользователь потом зайдёт без реферала, `hasReferral` останется `true`.

Фронту не нужно вычислять `hasReferral` самостоятельно. Нужно использовать значение, которое вернул сервер.

## 5. Методы авторизации

### 5.1 Пользователь из Telegram

Используется, если приложение открыто как Telegram Mini App.

Запрос:

```http
POST /api/auth/session
X-Telegram-Init-Data: <initData>
Content-Type: application/json
```

```json
{
  "referralCode": "https://t.me/lamoda_games_bot/search?startapp=PLAYER42"
}
```

Ответ:

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
    }
  }
}
```

Важно:

- анонимный режим больше не поддерживается;
- `POST /api/auth/session` работает только с Telegram `initData`;
- если `initData` положить в body или query, сервер вернёт `400`.

## 6. Жизненный цикл игры

Сервер возвращает одно из состояний:

- `idle`
- `active`
- `paused`
- `finished`
- `expired`

Именно по этим значениям фронт должен управлять UI.

## 7. Последовательность работы с игрой

### 7.1 При открытии приложения

Вызывать в таком порядке:

1. `POST /api/auth/session`
2. `GET /api/game/state`

Как интерпретировать ответ:

- `idle` -> показать стартовый экран
- `active` -> показать экран игры
- `paused` -> показать возврат в игру или автоматически резюмировать
- `finished` -> показать экран успешного завершения
- `expired` -> показать экран завершения по таймеру

### 7.2 Начать новую игру

Основной метод для Unity:

```http
POST /api/game/start-session
```

Запрос:

```http
POST /api/game/start-session
Authorization: Bearer <token>
```

или:

```http
POST /api/game/start-session
X-Telegram-Init-Data: <initData>
```

Тело:

```json
{
  "foundSneakerNumbers": [1, 4, 7]
}
```

Ответ:

```json
{
  "data": {
    "session": {
      "id": 15,
      "status": "active",
      "remainingSeconds": 600,
      "foundSneakerNumbers": [1],
      "pauseCount": 0,
      "startedAt": "2026-05-12T10:00:00.000Z",
      "lastResumedAt": "2026-05-12T10:00:00.000Z",
      "lastPausedAt": null,
      "lastHeartbeatAt": "2026-05-12T10:00:00.000Z",
      "finishedAt": null,
      "expiredAt": null,
      "canCollect": true
    },
    "lifecycle": "active",
    "reason": "new-session"
  }
}
```

Важно:

- Всего кроссовков `10`.
- Сервер всегда гарантирует, что первый кроссовок открыт по умолчанию.
- `start-session` может принять `foundSneakerNumbers` от Unity и запустить таймер на `10 минут`.
- Фронт не должен перетирать это значение своей локальной инициализацией.

### 7.3 Activity-логи во время игры

Во время игры Unity должен слать логи действий игрока:

```http
POST /api/game/activity-log
Authorization: Bearer <token>
```

или:

```http
POST /api/game/activity-log
X-Telegram-Init-Data: <initData>
Content-Type: application/json
```

Тело:

```json
{
  "source": "unity",
  "action": "swipe",
  "details": {
    "direction": "left"
  }
}
```

Что слать в `action`:

- `click`
- `swipe`
- `open-screen`
- `collect-sneaker`
- любые другие игровые события

Если сервер не получает activity-логи дольше `15 секунд`, игрок считается не онлайн.

### 7.4 Heartbeat

`POST /api/game/heartbeat` можно оставить как резервный legacy-вызов, но основной сигнал онлайна теперь лучше слать через `activity-log`.

### 7.5 Поставить игру на паузу

Использовать, когда приложение скрыто, свёрнуто или пользователь уходит с игрового экрана.

```http
POST /api/game/pause
Authorization: Bearer <token>
```

### 7.6 Возобновить игру

Использовать, когда пользователь вернулся в игру.

```http
POST /api/game/resume
Authorization: Bearer <token>
```

### 7.7 Отметить найденный кроссовок

Запрос:

```http
POST /api/game/found-sneaker
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "sneakerNumber": 4
}
```

Ответ:

```json
{
  "data": {
    "accepted": true,
    "session": {
      "id": 15,
      "status": "active",
      "remainingSeconds": 540,
      "foundSneakerNumbers": [1, 4],
      "pauseCount": 0,
      "startedAt": "2026-05-12T10:00:00.000Z",
      "lastResumedAt": "2026-05-12T10:00:00.000Z",
      "lastPausedAt": null,
      "lastHeartbeatAt": "2026-05-12T10:01:00.000Z",
      "finishedAt": null,
      "expiredAt": null,
      "canCollect": true
    },
    "lifecycle": "active"
  }
}
```

Поведение:

- если такой кроссовок уже был найден, сервер вернёт `accepted: false`;
- фронт всегда должен синхронизировать найденные элементы из `session.foundSneakerNumbers`.

### 7.8 Завершить игру

Когда все нужные кроссовки собраны:

```http
POST /api/game/finish
Authorization: Bearer <token>
```

Ответ:

```json
{
  "data": {
    "session": {
      "id": 15,
      "status": "finished",
      "remainingSeconds": 120,
      "foundSneakerNumbers": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      "pauseCount": 0,
      "startedAt": "2026-05-12T10:00:00.000Z",
      "lastResumedAt": null,
      "lastPausedAt": "2026-05-12T10:08:00.000Z",
      "lastHeartbeatAt": "2026-05-12T10:07:55.000Z",
      "finishedAt": "2026-05-12T10:08:00.000Z",
      "expiredAt": null,
      "canCollect": false
    },
    "lifecycle": "finished",
    "reason": "completed"
  }
}
```

## 8. Рекомендуемая форма состояния на фронте

Пример:

```ts
type FrontendAuthState = {
  token: string | null
  expiresAt: string | null
  player: {
    id: number
    telegramUserId: number | null
    username: string | null
    displayName: string
    authProvider: string
    referralCode: string | null
    referredByCode: string | null
    referralLink: string | null
    hasReferral: boolean
    isOnline: boolean
    lastSeenAt: string | null
    isExisting: boolean
  } | null
}

type FrontendGameState = {
  lifecycle: 'idle' | 'active' | 'paused' | 'finished' | 'expired'
  reason: string | null
  session: {
    id: number
    status: 'active' | 'paused' | 'finished' | 'expired'
    remainingSeconds: number
    foundSneakerNumbers: number[]
    pauseCount: number
    startedAt: string | null
    lastResumedAt: string | null
    lastPausedAt: string | null
    lastHeartbeatAt: string | null
    finishedAt: string | null
    expiredAt: string | null
    canCollect: boolean
  } | null
}
```

## 9. Минимальный пример последовательности на фронте

```ts
async function bootstrapGame() {
  const auth = await api.post('/auth/session', {
    initData: getTelegramInitData(),
    referralCode: getReferralCodeFromTelegramOrUrl(),
  })

  const token = auth.data.token

  const gameState = await api.get('/game/state', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  return {
    auth: auth.data,
    gameState: gameState.data,
  }
}
```

## 10. Обработка ошибок

Общий формат ошибки:

```json
{
  "error": {
    "message": "Some message",
    "details": null
  }
}
```

Основные случаи:

- `401` -> токен отсутствует, невалиден или истёк
- `409` -> неверное состояние игры, например попытка завершить игру слишком рано
- `400` -> ошибка валидации

Пример ошибки валидации:

```json
{
  "error": {
    "message": "Validation error",
    "details": {
      "fieldErrors": {
        "sneakerNumber": [
          "Too small: expected number to be >=1"
        ]
      }
    }
  }
}
```

## 11. Короткий чеклист для фронта

- Прочитать referral при открытии приложения.
- Отправить referral только в `POST /api/auth/session`.
- Сохранить bearer token.
- После auth всегда вызвать `/api/game/state`.
- Во время активной игры слать `activity-log` на действия игрока.
- При необходимости дополнительно использовать heartbeat как запасной сигнал.
- При скрытии экрана ставить игру на паузу.
- При возврате вызывать resume.
- Синхронизировать найденные кроссовки по ответу сервера.
- Использовать `player.hasReferral` из сервера, а не локальную догадку.
- Считать `lifecycle` и `session.status` источником истины.
