import { API_BASE_URL, LOCAL_AUTH_ENABLED } from '../app/env'
import type { AuthSession } from '../types/auth'

const SESSION_KEY = 'qdoc.auth.session'

type SessionUser = {
  id: string
  name: string
}

function parseSession(raw: string | null): AuthSession | null {
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as AuthSession
  } catch {
    return null
  }
}

function getSession(): AuthSession | null {
  if (typeof window === 'undefined') {
    return null
  }

  return parseSession(window.sessionStorage.getItem(SESSION_KEY))
}

function getSessionUser(): SessionUser | null {
  const session = getSession()
  if (!session) {
    return null
  }

  return {
    id: session.user.id,
    name: session.user.name,
  }
}

function getAccessToken() {
  const sessionToken = getSession()?.accessToken?.trim()
  if (sessionToken) {
    return sessionToken
  }

  const envToken = import.meta.env.VITE_AUTH_ACCESS_TOKEN?.trim()
  return envToken || null
}

function resolveErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const body = payload as Record<string, unknown>
  const message = body.message

  if (typeof message === 'string') {
    return message
  }

  if (Array.isArray(message) && message.length > 0) {
    return message.join(', ')
  }

  return null
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    return response.json()
  }

  const text = await response.text()
  return text || null
}

export class ApiError extends Error {
  readonly status: number
  readonly payload: unknown

  constructor(status: number, payload: unknown) {
    const message = resolveErrorMessage(payload) ?? `HTTP ${status}`
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json')
  }

  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const user = getSessionUser()

  if (LOCAL_AUTH_ENABLED && user) {
    headers.set('x-local-role', import.meta.env.VITE_LOCAL_ROLE ?? import.meta.env.VITE_DEV_ROLE ?? 'patient')
    headers.set('x-local-user-id', user.id)
    headers.set('x-local-name', user.name)
  } else {
    const accessToken = getAccessToken()
    if (accessToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${accessToken}`)
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  })

  const payload = await parseResponseBody(response)

  if (!response.ok) {
    throw new ApiError(response.status, payload)
  }

  return payload as T
}

export function toApiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    return resolveErrorMessage(error.payload) ?? error.message
  }

  return fallback
}

export function getCurrentSessionUser() {
  return getSessionUser()
}
