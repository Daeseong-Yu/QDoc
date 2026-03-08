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
    isDevAuthBypass,
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

  const infoMessage = sessionMessage ?? state.reason

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

  function handleDevSession() {
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
        <p className="muted">
          {isAuth0Available
            ? 'Continue with Auth0 for production-style sign-in, or use a local account only when dev bypass is enabled.'
            : 'Use a local account for MVP testing. Auth0 becomes available once the frontend domain and client ID are configured.'}
        </p>

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

        {isDevAuthBypass ? (
          <>
            <section className="auth-alt-card auth-alt-card-muted">
              <h3>Local account</h3>
              <p>Available in development bypass mode for fast MVP testing.</p>
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
              <h3>Developer shortcut</h3>
              <p>Start a local guest session without entering account details.</p>
              <button type="button" className="ghost-button auth-alt-button" onClick={handleDevSession}>
                Continue as guest user
              </button>
            </section>
          </>
        ) : null}

        {!isAuth0Available && !isDevAuthBypass ? (
          <section className="auth-alt-card auth-alt-card-muted">
            <h3>Authentication is not configured</h3>
            <p>Set Auth0 frontend variables or enable dev bypass to continue.</p>
          </section>
        ) : null}
      </section>
    </main>
  )
}
