import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  collectSneaker,
  createAuthSession,
  finishGame,
  logActivity,
  startGameSession,
} from './api.js'
import { logGameDebug } from './debug.js'

function getFoundSneakerNumbers(session) {
  if (Array.isArray(session?.foundSneakerNumbers)) {
    return session.foundSneakerNumbers
  }

  if (!Array.isArray(session?.foundSneakers)) {
    return [1]
  }

  return session.foundSneakers
    .filter((entry) => entry?.found && Number.isInteger(entry?.sneakerNumber))
    .map((entry) => entry.sneakerNumber)
    .sort((left, right) => left - right)
}

function normalizeGameState(gameState) {
  if (!gameState?.session) {
    return gameState
  }

  return {
    ...gameState,
    session: {
      ...gameState.session,
      foundSneakerNumbers: getFoundSneakerNumbers(gameState.session),
    },
  }
}

function extractGameStateFromAuthSession(authSession) {
  if (!authSession) {
    return null
  }

  if (!('session' in authSession) && !('lifecycle' in authSession) && !('reason' in authSession)) {
    return null
  }

  return normalizeGameState({
    session: authSession.session ?? null,
    lifecycle: authSession.lifecycle ?? 'idle',
    reason: authSession.reason ?? null,
  })
}

export function useBackendBootstrap() {
  const [state, setState] = useState({
    status: 'loading',
    token: null,
    player: null,
    gameState: null,
    error: null,
  })

  useEffect(() => {
    let cancelled = false
    logGameDebug('bootstrap:start')

    const bootstrap = async () => {
      try {
        const authSession = await createAuthSession()
        const gameStateFromAuth = extractGameStateFromAuthSession(authSession)
        const gameState = gameStateFromAuth ?? null

        if (cancelled) {
          return
        }

        setState({
          status: 'ready',
          token: authSession.token,
          player: authSession.player,
          gameState,
          error: null,
        })
        logGameDebug('bootstrap:ready', {
          playerId: authSession.player?.id ?? null,
          isExisting: Boolean(authSession.player?.isExisting),
          hasSession: Boolean(gameState?.session),
          lifecycle: gameState?.lifecycle ?? null,
          sessionStatus: gameState?.session?.status ?? null,
        })
      } catch (error) {
        if (cancelled) {
          return
        }

        setState({
          status: 'error',
          token: null,
          player: null,
          gameState: null,
          error,
        })
        logGameDebug('bootstrap:error', {
          message: error?.message ?? 'unknown error',
          status: error?.status ?? null,
        })
      }
    }

    void bootstrap()

    return () => {
      cancelled = true
    }
  }, [])

  return state
}

export function useServerGameSession({ token, initialGameState = null, autoStart = false }) {
  const [gameState, setGameState] = useState(() => normalizeGameState(initialGameState))
  const [requestState, setRequestState] = useState('idle')
  const [error, setError] = useState(null)
  const sessionRef = useRef(normalizeGameState(initialGameState)?.session ?? null)
  const lifecycleRef = useRef(normalizeGameState(initialGameState)?.lifecycle ?? 'idle')

  const applyState = useCallback((nextState) => {
    const normalizedState = normalizeGameState(nextState)

    sessionRef.current = normalizedState?.session ?? null
    lifecycleRef.current = normalizedState?.lifecycle ?? 'idle'
    setGameState(normalizedState)
  }, [])

  const runAction = useCallback(async (actionName, requestFactory, options = {}) => {
    const { silent = false } = options
    setRequestState('loading')
    setError(null)
    if (!silent) {
      logGameDebug('server-game:action-start', {
        action: actionName,
        lifecycle: lifecycleRef.current,
        sessionStatus: sessionRef.current?.status ?? null,
        sessionId: sessionRef.current?.id ?? null,
      })
    }

    try {
      const nextState = normalizeGameState(await requestFactory())
      applyState(nextState)
      setRequestState('idle')
      if (!silent) {
        logGameDebug('server-game:action-success', {
          action: actionName,
          lifecycle: nextState?.lifecycle ?? null,
          sessionStatus: nextState?.session?.status ?? null,
          sessionId: nextState?.session?.id ?? null,
        })
      }
      return nextState
    } catch (requestError) {
      setError(requestError)
      setRequestState('error')
      if (!silent) {
        logGameDebug('server-game:action-error', {
          action: actionName,
          message: requestError?.message ?? 'unknown error',
          status: requestError?.status ?? null,
        })
      }
      throw requestError
    }
  }, [applyState])

  const startSession = useCallback(async () => (
    runAction('start-session', () => startGameSession(token))
  ), [runAction, token])

  const collectSessionSneaker = useCallback(async (sneakerNumber) => {
    try {
      const result = await runAction(
        `collect-sneaker:${sneakerNumber}`,
        () => collectSneaker(token, sneakerNumber),
      )

      return {
        accepted: result.session ? result.accepted : false,
        session: result.session,
        lifecycle: result.lifecycle ?? result.session?.status ?? lifecycleRef.current,
      }
    } catch (requestError) {
      if (requestError.status === 409) {
        try {
          await startSession()
        } catch {
          // Ignore refresh failures here and surface the original error to the UI.
        }
      }

      throw requestError
    }
  }, [runAction, startSession, token])

  const finishSession = useCallback(async () => (
    runAction('finish-session', () => finishGame(token))
  ), [runAction, token])

  const logSessionActivity = useCallback(async (payload, { silent = true } = {}) => (
    runAction(
      `activity-log:${payload?.action ?? 'unknown'}`,
      () => logActivity(token, payload),
      { silent },
    )
  ), [runAction, token])

  useEffect(() => {
    logGameDebug('server-game:state-snapshot', {
      lifecycle: gameState?.lifecycle ?? null,
      sessionStatus: gameState?.session?.status ?? null,
      sessionId: gameState?.session?.id ?? null,
      foundCount: gameState?.session?.foundSneakerNumbers?.length ?? 0,
      requestState,
      autoStart,
      hasInitialSession: Boolean(initialGameState?.session),
    })
  }, [
    autoStart,
    gameState?.lifecycle,
    gameState?.session?.foundSneakerNumbers,
    gameState?.session?.id,
    gameState?.session?.status,
    initialGameState?.session,
    requestState,
  ])

  useEffect(() => {
    sessionRef.current = gameState?.session ?? null
    lifecycleRef.current = gameState?.lifecycle ?? 'idle'
  }, [gameState])

  useEffect(() => {
    if (!autoStart) {
      return undefined
    }

    logGameDebug('server-game:auto-start-triggered', {
      lifecycle: initialGameState?.lifecycle ?? null,
      hasInitialSession: Boolean(initialGameState?.session),
    })
    void startSession()

    return undefined
  }, [autoStart, initialGameState?.lifecycle, initialGameState?.session, startSession])

  const clientRemainingSeconds = useMemo(() => {
    if (!gameState?.session) {
      return 0
    }

    return Math.max(0, Number(gameState.session.remainingSeconds || 0))
  }, [gameState?.session])

  const [displayRemainingSeconds, setDisplayRemainingSeconds] = useState(clientRemainingSeconds)

  useEffect(() => {
    setDisplayRemainingSeconds(clientRemainingSeconds)
  }, [clientRemainingSeconds])

  useEffect(() => {
    if (gameState?.session?.status !== 'active') {
      return undefined
    }

    const intervalId = window.setInterval(() => {
      setDisplayRemainingSeconds((currentValue) => Math.max(0, currentValue - 1))
    }, 1_000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [gameState?.session?.status])

  useEffect(() => {
    if (gameState?.session?.status === 'active' && displayRemainingSeconds <= 0) {
      void finishSession()
    }
  }, [displayRemainingSeconds, finishSession, gameState?.session?.status])

  return {
    gameState,
    session: gameState?.session ?? null,
    lifecycle: gameState?.lifecycle ?? 'idle',
    requestState,
    error,
    displayRemainingSeconds,
    startSession,
    logSessionActivity,
    collectSessionSneaker,
    finishSession,
  }
}
