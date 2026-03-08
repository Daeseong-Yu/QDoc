import { Auth0Provider, useAuth0 } from '@auth0/auth0-react'
import { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  AUTH0_AUDIENCE,
  AUTH0_CLIENT_ID,
  AUTH0_DOMAIN,
  AUTH0_ENABLED,
  AUTH0_SCOPE,
} from '../../app/env'

type Auth0BridgeUser = {
  sub?: string
  name?: string
  nickname?: string
  email?: string
}

type Auth0BridgeValue = {
  isEnabled: boolean
  isLoading: boolean
  isAuthenticated: boolean
  user: Auth0BridgeUser | null
  errorMessage: string | null
  startLogin: (returnTo: string) => Promise<void>
  startLogout: (returnTo: string) => void
  getAccessToken: () => Promise<string | null>
}

const disabledBridgeValue: Auth0BridgeValue = {
  isEnabled: false,
  isLoading: false,
  isAuthenticated: false,
  user: null,
  errorMessage: null,
  startLogin: async () => undefined,
  startLogout: () => undefined,
  getAccessToken: async () => null,
}

const Auth0BridgeContext = createContext<Auth0BridgeValue>(disabledBridgeValue)

type ProviderProps = {
  children: ReactNode
}

function Auth0BridgeAdapter({ children }: ProviderProps) {
  const { isLoading, isAuthenticated, user, error, loginWithRedirect, logout, getAccessTokenSilently } = useAuth0()

  const value = useMemo<Auth0BridgeValue>(
    () => ({
      isEnabled: true,
      isLoading,
      isAuthenticated,
      user: user
        ? {
            sub: user.sub,
            name: user.name,
            nickname: user.nickname,
            email: user.email,
          }
        : null,
      errorMessage: error?.message ?? null,
      startLogin: async (returnTo) => {
        await loginWithRedirect({
          appState: {
            returnTo,
          },
        })
      },
      startLogout: (returnTo) => {
        const absoluteReturnTo = new URL(returnTo, window.location.origin).toString()

        logout({
          logoutParams: {
            returnTo: absoluteReturnTo,
          },
        })
      },
      getAccessToken: async () => {
        try {
          return await getAccessTokenSilently()
        } catch {
          return null
        }
      },
    }),
    [error?.message, getAccessTokenSilently, isAuthenticated, isLoading, loginWithRedirect, logout, user],
  )

  return <Auth0BridgeContext.Provider value={value}>{children}</Auth0BridgeContext.Provider>
}

export function Auth0ProviderWithNavigate({ children }: ProviderProps) {
  const navigate = useNavigate()

  if (!AUTH0_ENABLED) {
    return <Auth0BridgeContext.Provider value={disabledBridgeValue}>{children}</Auth0BridgeContext.Provider>
  }

  const audience = AUTH0_AUDIENCE || undefined

  return (
    <Auth0Provider
      domain={AUTH0_DOMAIN}
      clientId={AUTH0_CLIENT_ID}
      authorizationParams={{
        redirect_uri: `${window.location.origin}/login`,
        audience,
        scope: AUTH0_SCOPE,
      }}
      onRedirectCallback={(appState) => {
        const nextPath =
          appState && typeof appState === 'object' && 'returnTo' in appState && typeof appState.returnTo === 'string'
            ? appState.returnTo
            : '/'

        navigate(nextPath, { replace: true })
      }}
    >
      <Auth0BridgeAdapter>{children}</Auth0BridgeAdapter>
    </Auth0Provider>
  )
}

export function useAuth0Bridge() {
  return useContext(Auth0BridgeContext)
}
