import { createContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import type { AuthProviderKind, AuthSession } from '../../types/auth'

const SESSION_KEY = 'qdoc.auth.session'
const SESSION_DURATION_MS = 30 * 60 * 1000
const DEV_SESSION_DURATION_MS = 12 * 60 * 60 * 1000
const DEV_SESSION_USER_ID = 'dev-user'

type LoginInput = {
  name: string
  email: string
  consentAccepted: boolean
}

type AuthContextValue = {
  session: AuthSession | null
  isAuthenticated: boolean
  isReady: boolean
  isDevAuthBypass: boolean
  isAuth0Available: boolean
  authMethod: AuthProviderKind | null
  sessionMessage: string | null
  login: (input: LoginInput) => void
  startDevSession: () => void
  startAuth0Login: (returnTo?: string) => Promise<void>
  logout: (returnTo?: string) => void
  renewSession: () => void
  clearSessionMessage: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function isExpired(session: AuthSession) {
  return session.provider !== 'auth0' && session.expiresAt <= Date.now()
}

function isDevSession(session: AuthSession) {
  return session.provider === 'dev' || session.user.id === DEV_SESSION_USER_ID
}

function getStorage() {
  if (typeof window === 'undefined') {
    return null
  }

  return window.sessionStorage
}

function loadSession(): AuthSession | null {
  const storage = getStorage()
  if (!storage) {
    return null
  }

  const raw = storage.getItem(SESSION_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AuthSession>

    if (!parsed.user || typeof parsed.user !== 'object') {
      storage.removeItem(SESSION_KEY)
      return null
    }

    const provider = parsed.provider ?? 'local'

    return {
      provider,
      user: {
        id: String(parsed.user.id ?? ''),
        name: String(parsed.user.name ?? 'QDoc User'),
        email: String(parsed.user.email ?? ''),
      },
      consentAccepted: Boolean(parsed.consentAccepted),
      expiresAt: Number(parsed.expiresAt ?? 0),
      accessToken: typeof parsed.accessToken === 'string' ? parsed.accessToken : undefined,
    }
  } catch {
    storage.removeItem(SESSION_KEY)
    return null
  }
}

function saveSession(session: AuthSession | null) {
  const storage = getStorage()
  if (!storage) {
    return
  }

  if (!session) {
    storage.removeItem(SESSION_KEY)
    return
  }

  storage.setItem(SESSION_KEY, JSON.stringify(session))
}

function createSession(input: LoginInput): AuthSession {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `user-${Date.now()}`

  return {
    provider: 'local',
    user: {
      id,
      name: input.name,
      email: input.email,
    },
    consentAccepted: input.consentAccepted,
    expiresAt: Date.now() + SESSION_DURATION_MS,
  }
}

function createDevSession(): AuthSession {
  return {
    provider: 'dev',
    user: {
      id: DEV_SESSION_USER_ID,
      name: 'Guest User',
      email: 'guest@qdoc.local',
    },
    consentAccepted: true,
    expiresAt: Date.now() + DEV_SESSION_DURATION_MS,
  }
}

type AuthProviderProps = {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [sessionMessage, setSessionMessage] = useState<string | null>(null)
  const [hasLoadedLocalSession, setHasLoadedLocalSession] = useState(false)

  useEffect(() => {
    const stored = loadSession()

    if (!stored) {
      setHasLoadedLocalSession(true)
      return
    }

    if (isExpired(stored)) {
      saveSession(null)
      setSessionMessage('Session expired. Please sign in again.')
      setHasLoadedLocalSession(true)
      return
    }

    setSession(stored)
    setHasLoadedLocalSession(true)
  }, [])

  useEffect(() => {
    saveSession(session)
  }, [session])

  useEffect(() => {
    if (!session || session.provider === 'auth0') {
      return
    }

    const remainingMs = session.expiresAt - Date.now()
    if (remainingMs <= 0) {
      setSession(null)
      setSessionMessage('Session expired. Please sign in again.')
      return
    }

    const timer = window.setTimeout(() => {
      setSession(null)
      setSessionMessage('Session expired. Please sign in again.')
    }, remainingMs)

    return () => window.clearTimeout(timer)
  }, [session])

  const authMethod: AuthProviderKind | null = session?.provider ?? null

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isAuthenticated: Boolean(session),
      isReady: hasLoadedLocalSession,
      isDevAuthBypass: true,
      isAuth0Available: false,
      authMethod,
      sessionMessage,
      login: (input) => {
        setSession(createSession(input))
        setSessionMessage(null)
      },
      startDevSession: () => {
        setSession(createDevSession())
        setSessionMessage(null)
      },
      startAuth0Login: async () => {
        setSessionMessage('Auth0 is not configured yet.')
      },
      logout: () => {
        setSession(null)
        setSessionMessage(null)
      },
      renewSession: () => {
        if (!session || session.provider === 'auth0') {
          return
        }

        setSession({
          ...session,
          expiresAt: Date.now() + (isDevSession(session) ? DEV_SESSION_DURATION_MS : SESSION_DURATION_MS),
        })
        setSessionMessage(null)
      },
      clearSessionMessage: () => {
        setSessionMessage(null)
      },
    }),
    [authMethod, hasLoadedLocalSession, session, sessionMessage],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export { AuthContext }
