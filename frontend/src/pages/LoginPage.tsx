import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import type { FormEvent } from 'react'
import { useState } from 'react'

import { useAuth } from '../features/auth/useAuth'

type LocationState = {
  from?: string
  reason?: string
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state ?? {}) as LocationState
  const {
    isAuthenticated,
    isAuth0Available,
    isLocalAuthEnabled,
    isReady,
    login,
    startAuth0Login,
    startDevSession,
    sessionMessage,
    clearSessionMessage,
  } = useAuth()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const from = state.from ?? '/'
  const infoMessage = sessionMessage ?? state.reason
  const introText = isAuth0Available
    ? isLocalAuthEnabled
      ? 'Continue with Auth0 or use a local account.'
      : 'Continue with Auth0 to access QDoc.'
    : isLocalAuthEnabled
      ? 'Use your local account to continue.'
      : 'Authentication is not configured for this environment.'

  if (!isReady) {
    return (
      <main className="auth-layout">
        <section className="auth-card">
          <p className="brand-kicker">QDoc</p>
          <h2>Preparing sign-in</h2>
          <p className="muted">Please wait while QDoc restores your authentication state.</p>
        </section>
      </main>
    )
  }

  if (isAuthenticated) {
    return <Navigate to={from} replace />
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!name.trim() || !email.trim()) {
      setFormError('Name and email are required.')
      return
    }

    if (!consentAccepted) {
      setFormError('You must accept the privacy consent to continue.')
      return
    }

    login({
      name: name.trim(),
      email: email.trim(),
      consentAccepted,
    })

    clearSessionMessage()
    navigate(from, { replace: true })
  }

  function handleGuestSession() {
    startDevSession()
    clearSessionMessage()
    navigate(from, { replace: true })
  }

  async function handleAuth0Login() {
    setFormError(null)
    clearSessionMessage()
    await startAuth0Login(from)
  }

  return (
    <main className="auth-layout">
      <section className="auth-card">
        <p className="brand-kicker">QDoc</p>
        <h2>Sign in or join</h2>
        <p className="muted">{introText}</p>

        {infoMessage ? <p className="info-banner">{infoMessage}</p> : null}
        {formError ? <p className="error-banner">{formError}</p> : null}

        {isAuth0Available ? (
          <section className="auth-alt-card">
            <h3>Auth0 sign-in</h3>
            <p>Use your hosted login flow and return to the requested page after authentication.</p>
            <button type="button" className="primary-button auth-alt-button" onClick={handleAuth0Login}>
              Continue with Auth0
            </button>
          </section>
        ) : null}

        {isLocalAuthEnabled ? (
          <>
            <section className="auth-alt-card auth-alt-card-muted">
              <h3>Local account</h3>
              <p>Use your name and email to continue.</p>
            </section>

            <form onSubmit={handleSubmit} className="auth-form">
              <label>
                Full Name
                <input
                  type="text"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value)
                    setFormError(null)
                  }}
                  placeholder="Alex Kim"
                />
              </label>

              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value)
                    setFormError(null)
                  }}
                  placeholder="alex@example.com"
                />
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={consentAccepted}
                  onChange={(event) => {
                    setConsentAccepted(event.target.checked)
                    setFormError(null)
                  }}
                />
                I agree to data use for queue and notification purposes.
              </label>

              <button type="submit" className="ghost-button auth-submit-button">
                Continue with local account
              </button>
            </form>

            <section className="auth-alt-card">
              <h3>Guest access</h3>
              <p>Continue without creating a full account.</p>
              <button type="button" className="ghost-button auth-alt-button" onClick={handleGuestSession}>
                Continue as guest user
              </button>
            </section>
          </>
        ) : null}

        {!isAuth0Available && !isLocalAuthEnabled ? (
          <section className="auth-alt-card auth-alt-card-muted">
            <h3>Authentication is not configured</h3>
            <p>Set Auth0 frontend variables or enable local auth to continue.</p>
          </section>
        ) : null}
      </section>
    </main>
  )
}
