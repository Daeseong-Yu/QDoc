function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

const DEFAULT_API_PORT = '4000'

function resolveDefaultApiBaseUrl() {
  if (typeof window === 'undefined') {
    return `http://localhost:${DEFAULT_API_PORT}/api`
  }

  const apiPort = import.meta.env.VITE_API_PORT ?? DEFAULT_API_PORT
  return `${window.location.protocol}//${window.location.hostname}:${apiPort}/api`
}

function resolveDefaultWsBaseUrl() {
  if (typeof window === 'undefined') {
    return `http://localhost:${DEFAULT_API_PORT}`
  }

  const apiPort = import.meta.env.VITE_API_PORT ?? DEFAULT_API_PORT
  return `${window.location.protocol}//${window.location.hostname}:${apiPort}`
}

export const LOCAL_AUTH_ENABLED =
  import.meta.env.VITE_LOCAL_AUTH_ENABLED === 'true' ||
  (import.meta.env.DEV && import.meta.env.VITE_AUTH_BYPASS !== 'false')

export const AUTH0_DOMAIN = import.meta.env.VITE_AUTH0_DOMAIN?.trim() ?? ''
export const AUTH0_CLIENT_ID = import.meta.env.VITE_AUTH0_CLIENT_ID?.trim() ?? ''
export const AUTH0_AUDIENCE = import.meta.env.VITE_AUTH0_AUDIENCE?.trim() ?? ''
export const AUTH0_SCOPE = import.meta.env.VITE_AUTH0_SCOPE?.trim() || 'openid profile email'

export const AUTH0_ENABLED = Boolean(AUTH0_DOMAIN && AUTH0_CLIENT_ID)
export const AUTH0_UI_ENABLED = AUTH0_ENABLED || import.meta.env.VITE_SHOW_AUTH0_UI === 'true'

export const API_BASE_URL = trimTrailingSlash(import.meta.env.VITE_API_BASE_URL ?? resolveDefaultApiBaseUrl())

export const WS_BASE_URL = trimTrailingSlash(import.meta.env.VITE_WS_BASE_URL ?? resolveDefaultWsBaseUrl())
