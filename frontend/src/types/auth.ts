export type AuthProviderKind = 'local' | 'dev' | 'auth0'

export type AuthUser = {
  id: string
  name: string
  email: string
}

export type AuthSession = {
  provider: AuthProviderKind
  user: AuthUser
  consentAccepted: boolean
  expiresAt: number
  accessToken?: string
}
