# Sequences

This file shows the main backend flows as step-by-step sequences.

## 1. Server Startup

```mermaid
sequenceDiagram
    participant Node as Node Process
    participant Env as Env Loader
    participant DB as PostgreSQL
    participant App as Express App

    Node->>Env: loadConfig()
    Node->>DB: createPool(DATABASE_URL)
    Node->>DB: runMigrations()
    Node->>App: buildDependencies()
    Node->>App: createApp()
    Node->>App: listen(PORT)
```

## 2. Telegram Auth With Referral

```mermaid
sequenceDiagram
    participant Client
    participant API as /api/auth/session
    participant Auth as Auth Service
    participant DB as players

    Client->>API: POST referralCode + X-Telegram-Init-Data
    API->>Auth: createSession(payload)
    Auth->>Auth: extractTelegramUserFromInitData()
    Auth->>Auth: normalizeReferralCode()
    Auth->>DB: findPlayerByTelegramUserId()
    Auth->>DB: upsertTelegramPlayer()
    DB-->>Auth: player row
    Auth-->>API: token + player.hasReferral
    API-->>Client: 201 Created
```

## 3. Gameplay Bootstrap

```mermaid
sequenceDiagram
    participant Client
    participant AuthAPI as /api/auth/session
    participant GameAPI as /api/game/state

    Client->>AuthAPI: create session
    AuthAPI-->>Client: token + player
    Client->>GameAPI: GET state with Bearer token
    GameAPI-->>Client: lifecycle + session or idle
```

## 4. Start New Game

```mermaid
sequenceDiagram
    participant Client
    participant API as /api/game/start-session
    participant Game as Game Service
    participant DB as game_sessions

    Client->>API: POST start-session
    API->>Game: startSession(playerId)
    Game->>DB: findLatestOpenSessionByPlayerId()
    alt active session exists
        Game-->>API: existing active session
    else paused session exists
        Game->>DB: update status=active
        Game-->>API: resumed session
    else no open session
        Game->>DB: insert new active session
        Game-->>API: new session with foundSneakers=[{ sneakerNumber: 1, found: true }, ...]
    end
    API-->>Client: current game state
```

## 5. Activity Log Loop

```mermaid
sequenceDiagram
    participant Client
    participant API as /api/game/activity-log
    participant Game as Game Service
    participant DB as game_sessions/game_activity_logs

    loop every few seconds while active
        Client->>API: POST activity-log
        API->>Game: logActivity(playerId, payload)
        Game->>DB: insert log + update last_heartbeat_at
        API-->>Client: active session snapshot
    end
```

## 6. Collect Sneaker

```mermaid
sequenceDiagram
    participant Client
    participant API as /api/game/found-sneaker
    participant Game as Game Service
    participant DB as game_sessions

    Client->>API: POST sneakerNumber
    API->>Game: collectSneaker(playerId, payload)
    Game->>Game: validate payload with Zod
    Game->>DB: load open session
    alt session active and sneaker not collected yet
        Game->>DB: update found_sneaker_numbers
        API-->>Client: accepted=true
    else duplicate
        API-->>Client: accepted=false
    else invalid state
        API-->>Client: 409 error
    end
```

## 7. Finish Game

```mermaid
sequenceDiagram
    participant Client
    participant API as /api/game/finish
    participant Game as Game Service
    participant Sessions as game_sessions
    participant Results as game_results

    Client->>API: POST finish
    API->>Game: finishSession(playerId)
    Game->>Sessions: load open session
    Game->>Game: verify active, not expired, all sneakers found
    Game->>Sessions: update status=finished
    Game->>Results: insert result row
    API-->>Client: lifecycle=finished
```
