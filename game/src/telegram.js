const TELEGRAM_BRAND_COLOR = '#1b2533'
const MOBILE_DEVICE_PATTERN = /iPhone|iPad|iPod|Android/i
const HANDSET_MAX_VIEWPORT_EDGE = 767

let bootstrapPromise

function isTelegramWebApp() {
  return typeof window !== 'undefined' && Boolean(window.Telegram?.WebApp)
}

export function getTelegramWebApp() {
  return window.Telegram?.WebApp ?? null
}

function normalizeStartParam(value) {
  const normalized = String(value ?? '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '')

  return normalized || null
}

export function getTelegramStartParam() {
  const webApp = getTelegramWebApp()
  const unsafeData = webApp?.initDataUnsafe ?? null

  const candidates = [
    unsafeData?.start_param,
    unsafeData?.startapp,
  ]

  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search)
    candidates.push(
      params.get('tgWebAppStartParam'),
      params.get('startapp'),
      params.get('start_param'),
      params.get('ref'),
    )
  }

  for (const candidate of candidates) {
    const normalized = normalizeStartParam(candidate)
    if (normalized) {
      return normalized
    }
  }

  return null
}

function isMobileDevice() {
  return MOBILE_DEVICE_PATTERN.test(window.navigator.userAgent)
}

function isHandsetDevice() {
  if (!isMobileDevice()) {
    return false
  }

  return Math.min(window.innerWidth, window.innerHeight) <= HANDSET_MAX_VIEWPORT_EDGE
}

function compareTelegramVersions(leftVersion, rightVersion) {
  const leftParts = String(leftVersion || '0')
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0)
  const rightParts = String(rightVersion || '0')
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0)
  const maxLength = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = leftParts[index] ?? 0
    const rightPart = rightParts[index] ?? 0

    if (leftPart > rightPart) {
      return 1
    }

    if (leftPart < rightPart) {
      return -1
    }
  }

  return 0
}

function isTelegramVersionAtLeast(webApp, minVersion) {
  if (!webApp) {
    return false
  }

  if (typeof webApp.isVersionAtLeast === 'function') {
    try {
      return webApp.isVersionAtLeast(minVersion)
    } catch {
      return compareTelegramVersions(webApp.version, minVersion) >= 0
    }
  }

  return compareTelegramVersions(webApp.version, minVersion) >= 0
}

function canRequestTelegramFullscreen(webApp) {
  return (
    Boolean(webApp)
    && typeof webApp.requestFullscreen === 'function'
    && isTelegramVersionAtLeast(webApp, '8.0')
  )
}

function toCssDimension(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value}px`
  }

  return fallback
}

function bindTelegramCssVars(webApp) {
  const root = document.documentElement
  const safeArea = webApp.safeAreaInset || {}
  const contentSafeArea = webApp.contentSafeAreaInset || safeArea

  root.style.setProperty(
    '--tg-viewport-width',
    toCssDimension(webApp.viewportWidth, `${window.innerWidth}px`),
  )
  root.style.setProperty(
    '--tg-viewport-height',
    toCssDimension(webApp.viewportHeight, `${window.innerHeight}px`),
  )
  root.style.setProperty(
    '--tg-viewport-stable-height',
    toCssDimension(webApp.viewportStableHeight, `${window.innerHeight}px`),
  )
  root.style.setProperty('--tg-safe-area-inset-top', toCssDimension(safeArea.top, '0px'))
  root.style.setProperty(
    '--tg-safe-area-inset-bottom',
    toCssDimension(safeArea.bottom, '0px'),
  )
  root.style.setProperty('--tg-safe-area-inset-left', toCssDimension(safeArea.left, '0px'))
  root.style.setProperty(
    '--tg-safe-area-inset-right',
    toCssDimension(safeArea.right, '0px'),
  )
  root.style.setProperty(
    '--tg-content-safe-area-inset-top',
    toCssDimension(contentSafeArea.top, '0px'),
  )
  root.style.setProperty(
    '--tg-content-safe-area-inset-bottom',
    toCssDimension(contentSafeArea.bottom, '0px'),
  )
  root.style.setProperty(
    '--tg-content-safe-area-inset-left',
    toCssDimension(contentSafeArea.left, '0px'),
  )
  root.style.setProperty(
    '--tg-content-safe-area-inset-right',
    toCssDimension(contentSafeArea.right, '0px'),
  )
}

function syncTelegramUiState(webApp) {
  const root = document.documentElement
  const platform = String(webApp?.platform || '').toLowerCase()

  root.dataset.tgPlatform = platform
  root.dataset.tgMobile = isMobileDevice() ? 'true' : 'false'
  root.dataset.tgExpanded = webApp?.isExpanded ? 'true' : 'false'
  root.dataset.tgFullscreen = webApp?.isFullscreen ? 'true' : 'false'

  bindTelegramCssVars(webApp)
}

function safelyExpandTelegramApp(webApp) {
  if (!webApp) {
    return
  }

  try {
    if (typeof webApp.ready === 'function') {
      webApp.ready()
    }

    if (typeof webApp.setBackgroundColor === 'function') {
      webApp.setBackgroundColor(TELEGRAM_BRAND_COLOR)
    }

    if (typeof webApp.setHeaderColor === 'function') {
      webApp.setHeaderColor(TELEGRAM_BRAND_COLOR)
    }

    if (typeof webApp.setBottomBarColor === 'function') {
      webApp.setBottomBarColor(TELEGRAM_BRAND_COLOR)
    }

    if (typeof webApp.expand === 'function') {
      webApp.expand()
    }

    if (isMobileDevice() && typeof webApp.disableVerticalSwipes === 'function') {
      webApp.disableVerticalSwipes()
    }

    if (isHandsetDevice() && canRequestTelegramFullscreen(webApp)) {
      const fullscreenResult = webApp.requestFullscreen()

      if (fullscreenResult && typeof fullscreenResult.catch === 'function') {
        fullscreenResult.catch(() => {})
      }
    }
  } catch (error) {
    console.warn('Telegram Mini App initialization failed', error)
  }
}

export function bootstrapTelegram() {
  if (bootstrapPromise) {
    return bootstrapPromise
  }

  bootstrapPromise = (async () => {
    if (!isTelegramWebApp()) {
      return
    }

    try {
      const webApp = getTelegramWebApp()

      if (!webApp) {
        return
      }

      syncTelegramUiState(webApp)

      webApp.onEvent?.('viewportChanged', () => {
        syncTelegramUiState(webApp)
      })
      webApp.onEvent?.('fullscreenChanged', () => {
        syncTelegramUiState(webApp)
      })
      webApp.onEvent?.('fullscreenFailed', () => {
        syncTelegramUiState(webApp)
      })
      webApp.onEvent?.('safeAreaChanged', () => {
        syncTelegramUiState(webApp)
      })
      webApp.onEvent?.('contentSafeAreaChanged', () => {
        syncTelegramUiState(webApp)
      })

      safelyExpandTelegramApp(webApp)
      syncTelegramUiState(webApp)
    } catch (error) {
      console.warn('Telegram Mini App bootstrap failed', error)
    }
  })()

  return bootstrapPromise
}

export function requestTelegramFullscreen() {
  const webApp = getTelegramWebApp()

  if (!webApp || !isMobileDevice()) {
    return
  }

  try {
    if (typeof webApp.expand === 'function') {
      webApp.expand()
    }

    if (canRequestTelegramFullscreen(webApp)) {
      const fullscreenResult = webApp.requestFullscreen()

      if (fullscreenResult && typeof fullscreenResult.catch === 'function') {
        fullscreenResult.catch(() => {})
      }
    }
  } catch (error) {
    console.warn('Telegram fullscreen request failed', error)
  }
}
