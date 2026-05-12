import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  collectSneaker,
  createAuthSession,
  finishGame,
  getGameState,
  pauseGame,
  resumeGame,
  sendHeartbeat,
  startGame,
} from './api.js'
import { logGameDebug } from './debug.js'

function isTerminalLifecycle(lifecycle) {
  return lifecycle === 'finished' || lifecycle === 'expired'
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
        const gameState = await getGameState(authSession.token)

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
  const [gameState, setGameState] = useState(initialGameState)
  const [requestState, setRequestState] = useState('idle')
  const [error, setError] = useState(null)
  const sessionRef = useRef(initialGameState?.session ?? null)
  const lifecycleRef = useRef(initialGameState?.lifecycle ?? 'idle')

  const applyState = useCallback((nextState) => {
    sessionRef.current = nextState?.session ?? null
    lifecycleRef.current = nextState?.lifecycle ?? 'idle'
    setGameState(nextState)
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
      const nextState = await requestFactory()
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

  const refreshState = useCallback(async () => (
    runAction('refresh-state', () => getGameState(token))
  ), [runAction, token])

  const startSession = useCallback(async () => (
    runAction('start-session', () => startGame(token))
  ), [runAction, token])

  const resumeSession = useCallback(async () => (
    runAction('resume-session', () => resumeGame(token))
  ), [runAction, token])

  const pauseSession = useCallback(async ({ keepalive = false } = {}) => (
    runAction('pause-session', () => pauseGame(token, { keepalive }), { silent: keepalive })
  ), [runAction, token])

  const heartbeatSession = useCallback(async () => (
    runAction('heartbeat-session', () => sendHeartbeat(token), { silent: true })
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
          await refreshState()
        } catch {
          // Ignore refresh failures here and surface the original error to the UI.
        }
      }

      throw requestError
    }
  }, [refreshState, runAction, token])

  const finishSession = useCallback(async () => (
    runAction('finish-session', () => finishGame(token))
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
    if (!autoStart || initialGameState?.session) {
      return undefined
    }

    logGameDebug('server-game:auto-start-triggered', {
      lifecycle: initialGameState?.lifecycle ?? null,
    })
    void startSession()

    return undefined
  }, [autoStart, initialGameState?.lifecycle, initialGameState?.session, startSession])

  useEffect(() => {
    if (initialGameState?.session?.status !== 'paused') {
      return undefined
    }

    logGameDebug('server-game:auto-resume-triggered', {
      sessionId: initialGameState?.session?.id ?? null,
    })
    void resumeSession()

    return undefined
  }, [initialGameState?.session?.status, resumeSession])

  useEffect(() => {
    if (gameState?.session?.status !== 'active') {
      return undefined
    }

    const intervalId = window.setInterval(() => {
      void heartbeatSession()
    }, 5_000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [gameState?.session?.status, heartbeatSession])

  useEffect(() => {
    const handleVisibilityChange = () => {
      const session = sessionRef.current

      if (!session || isTerminalLifecycle(lifecycleRef.current)) {
        return
      }

      if (document.visibilityState === 'hidden' && session.status === 'active') {
        void pauseSession({ keepalive: true })
        return
      }

      if (document.visibilityState === 'visible' && session.status === 'paused') {
        void resumeSession()
      }
    }

    const handlePageHide = () => {
      const session = sessionRef.current

      if (session?.status === 'active') {
        void pauseSession({ keepalive: true })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handlePageHide)

      if (sessionRef.current?.status === 'active') {
        void pauseSession({ keepalive: true })
      }
    }
  }, [pauseSession, resumeSession])

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
      void refreshState()
    }
  }, [displayRemainingSeconds, gameState?.session?.status, refreshState])

  return {
    gameState,
    session: gameState?.session ?? null,
    lifecycle: gameState?.lifecycle ?? 'idle',
    requestState,
    error,
    displayRemainingSeconds,
    startSession,
    resumeSession,
    pauseSession,
    heartbeatSession,
    collectSessionSneaker,
    finishSession,
    refreshState,
  }
}
