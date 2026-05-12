let debugSequence = 0

function getGlobalStore() {
  if (typeof window === 'undefined') {
    return null
  }

  if (!Array.isArray(window.__lamodaGameDebugLog)) {
    window.__lamodaGameDebugLog = []
  }

  if (typeof window.__lamodaGameDebugDump !== 'function') {
    window.__lamodaGameDebugDump = () => [...window.__lamodaGameDebugLog]
  }

  return window.__lamodaGameDebugLog
}

export function logGameDebug(event, payload = {}) {
  if (typeof window === 'undefined') {
    return
  }

  debugSequence += 1

  const entry = {
    seq: debugSequence,
    at: new Date().toISOString(),
    perfMs: Math.round(window.performance?.now?.() ?? 0),
    event,
    payload,
  }

  const store = getGlobalStore()
  if (store) {
    store.push(entry)

    if (store.length > 400) {
      store.splice(0, store.length - 400)
    }
  }

  console.log('[lamoda-debug]', event, payload)
}
