import { getTelegramStartParam, getTelegramWebApp } from './telegram.js'

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api'
const ANONYMOUS_ID_STORAGE_KEY = 'lamoda-adidas-anonymous-id'
const ENTERED_GAME_STORAGE_KEY = 'lamoda-adidas-entered-game'

function createAnonymousId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `anon-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`
}

function getAnonymousId() {
  if (typeof window === 'undefined') {
    return createAnonymousId()
  }

  const existingId = window.localStorage.getItem(ANONYMOUS_ID_STORAGE_KEY)

  if (existingId) {
    return existingId
  }

  const nextId = createAnonymousId()
  window.localStorage.setItem(ANONYMOUS_ID_STORAGE_KEY, nextId)
  return nextId
}

async function request(pathname, { method = 'GET', token = null, body, keepalive = false } = {}) {
  const response = await fetch(`${API_BASE_URL}${pathname}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    keepalive,
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const error = new Error(payload?.error?.message || 'Request failed')
    error.status = response.status
    error.details = payload?.error?.details ?? null
    throw error
  }

  return payload?.data ?? null
}

export async function createAuthSession() {
  const webApp = getTelegramWebApp()
  const initData = webApp?.initData?.trim()
  const referralCode = getTelegramStartParam()

  return request('/auth/session', {
    method: 'POST',
    body: initData
      ? {
          initData,
          profile: webApp?.initDataUnsafe?.user,
          referralCode,
        }
      : {
          anonymousId: getAnonymousId(),
          referralCode,
        },
  })
}

export function resetAnonymousId() {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(ANONYMOUS_ID_STORAGE_KEY)
  window.localStorage.removeItem(ENTERED_GAME_STORAGE_KEY)
}

export function hasEnteredGameBefore() {
  if (typeof window === 'undefined') {
    return false
  }

  return window.localStorage.getItem(ENTERED_GAME_STORAGE_KEY) === 'true'
}

export function markGameEntered() {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(ENTERED_GAME_STORAGE_KEY, 'true')
}

export async function getGameState(token) {
  return request('/game/state', { token })
}

export async function deleteCurrentPlayer(token) {
  return request('/auth/current', {
    method: 'DELETE',
    token,
  })
}

export async function startGame(token) {
  return request('/game/start', {
    method: 'POST',
    token,
  })
}

export async function resumeGame(token) {
  return request('/game/resume', {
    method: 'POST',
    token,
  })
}

export async function pauseGame(token, { keepalive = false } = {}) {
  return request('/game/pause', {
    method: 'POST',
    token,
    keepalive,
  })
}

export async function sendHeartbeat(token) {
  return request('/game/heartbeat', {
    method: 'POST',
    token,
  })
}

export async function collectSneaker(token, sneakerNumber) {
  return request('/game/found-sneaker', {
    method: 'POST',
    token,
    body: {
      sneakerNumber,
    },
  })
}

export async function finishGame(token) {
  return request('/game/finish', {
    method: 'POST',
    token,
  })
}
