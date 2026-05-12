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

## 2. Anonymous Auth With Referral

```mermaid
sequenceDiagram
    participant Client
    participant API as /api/auth/session
    participant Auth as Auth Service
    participant DB as players

    Client->>API: POST anonymousId + referralCode
    API->>Auth: createSession(payload)
    Auth->>Auth: normalizeReferralCode()
    Auth->>DB: findPlayerByAnonymousId()
    Auth->>DB: upsertAnonymousPlayer()
    DB-->>Auth: player row
    Auth-->>API: token + player.hasReferral=true
    API-->>Client: 201 Created
```

## 3. Telegram Auth With Referral

```mermaid
sequenceDiagram
    participant Client
    participant API as /api/auth/session
    participant Auth as Auth Service
    participant TG as Telegram Validator
    participant DB as players

    Client->>API: POST initData + profile + referralCode
    API->>Auth: createSession(payload)
    Auth->>TG: extractTelegramUserFromInitData()
    Auth->>TG: validateTelegramInitData()
    Auth->>Auth: normalizeReferralCode()
    Auth->>DB: findPlayerByTelegramUserId()
    Auth->>DB: upsertTelegramPlayer()
    DB-->>Auth: player row
    Auth-->>API: token + player.hasReferral
    API-->>Client: 201 Created
```

## 4. Gameplay Bootstrap

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

## 5. Start New Game

```mermaid
sequenceDiagram
    participant Client
    participant API as /api/game/start
    participant Game as Game Service
    participant DB as game_sessions

    Client->>API: POST start
    API->>Game: startSession(playerId)
    Game->>DB: findLatestOpenSessionByPlayerId()
    alt active session exists
        Game-->>API: existing active session
    else paused session exists
        Game->>DB: update status=active
        Game-->>API: resumed session
    else no open session
        Game->>DB: insert new active session
        Game-->>API: new session with foundSneakerNumbers=[1]
    end
    API-->>Client: current game state
```

## 6. Heartbeat Loop

```mermaid
sequenceDiagram
    participant Client
    participant API as /api/game/heartbeat
    participant Game as Game Service
    participant DB as game_sessions

    loop every few seconds while active
        Client->>API: POST heartbeat
        API->>Game: recordHeartbeat(playerId)
        Game->>DB: update last_heartbeat_at
        API-->>Client: active session snapshot
    end
```

## 7. Pause And Resume

```mermaid
sequenceDiagram
    participant Client
    participant PauseAPI as /api/game/pause
    participant ResumeAPI as /api/game/resume
    participant Game as Game Service
    participant DB as game_sessions

    Client->>PauseAPI: POST pause
    PauseAPI->>Game: pauseSession(playerId)
    Game->>DB: update status=paused
    PauseAPI-->>Client: paused session

    Client->>ResumeAPI: POST resume
    ResumeAPI->>Game: resumeSession(playerId)
    Game->>DB: update status=active
    ResumeAPI-->>Client: active session
```

## 8. Collect Sneaker

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

## 9. Finish Game

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

## 10. Products Read Flow

```mermaid
sequenceDiagram
    participant Client
    participant API as /api/products
    participant Service as Products Service
    participant DB as products

    Client->>API: GET /api/products
    API->>Service: getAllProducts()
    Service->>DB: SELECT products
    DB-->>Service: rows
    Service-->>API: product list
    API-->>Client: data[]
```

## 11. Products Create Flow

```mermaid
sequenceDiagram
    participant Client
    participant API as /api/products
    participant Service as Products Service
    participant DB as products

    Client->>API: POST product payload
    API->>Service: createProduct(payload)
    Service->>Service: validate with Zod
    Service->>DB: INSERT product
    DB-->>Service: created row
    API-->>Client: 201 data
```
