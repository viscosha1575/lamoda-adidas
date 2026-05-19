import { getTelegramStartParam, getTelegramWebApp } from './telegram.js'

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api'
const ENTERED_GAME_STORAGE_KEY = 'lamoda-adidas-entered-game'

function getTelegramInitData() {
  return getTelegramWebApp()?.initData?.trim() ?? null
}

async function request(pathname, {
  method = 'GET',
  token = null,
  body,
  keepalive = false,
  headers = {},
} = {}) {
  const initData = getTelegramInitData()
  const response = await fetch(`${API_BASE_URL}${pathname}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(initData ? { 'X-Telegram-Init-Data': initData } : {}),
      ...headers,
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
  const initData = getTelegramInitData()
  const startParam = getTelegramStartParam()

  console.log('Telegram initData before auth session:', initData ?? null)
  console.log('Telegram initDataUnsafe before auth session:', webApp?.initDataUnsafe ?? null)

  if (!initData) {
    throw new Error('Telegram initData is required')
  }

  return request('/auth/session', {
    method: 'POST',
    headers: {
      'X-Telegram-Init-Data': initData,
    },
    body: startParam
      ? { startParam }
      : {},
  })
}

export function resetAnonymousId() {
  if (typeof window === 'undefined') {
    return
  }

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

export async function checkSubscriptionStatus(token) {
  return request('/game/subscription-status', { token })
}

export async function deleteCurrentPlayer(token) {
  return request('/auth/current', {
    method: 'DELETE',
    token,
  })
}

export async function startGameSession(token) {
  return request('/game/start-session', {
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

export async function logActivity(token, payload) {
  return request('/game/activity-log', {
    method: 'POST',
    token,
    body: payload,
  })
}
