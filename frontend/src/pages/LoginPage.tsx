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
          <p className="muted">Please wait a moment.</p>
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
        <p className="muted">{isAuth0Available ? 'Choose a sign-in method to continue.' : 'Sign in to continue.'}</p>

        {infoMessage ? <p className="info-banner">{infoMessage}</p> : null}
        {formError ? <p className="error-banner">{formError}</p> : null}

        {isAuth0Available ? (
          <section className="auth-alt-card">
            <h3>Secure sign-in</h3>
            <p>Use your account to continue.</p>
            <button type="button" className="primary-button auth-alt-button" onClick={handleAuth0Login}>
              Continue with Auth0
            </button>
          </section>
        ) : null}

        {isDevAuthBypass ? (
          <>
            <section className="auth-alt-card auth-alt-card-muted">
              <h3>Local account</h3>
              <p>Enter your details to continue.</p>
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
                I agree to receive queue and visit updates.
              </label>

              <button type="submit" className="ghost-button auth-submit-button">
                Continue
              </button>
            </form>

            <section className="auth-alt-card">
              <h3>Guest access</h3>
              <p>Continue without full account setup.</p>
              <button type="button" className="ghost-button auth-alt-button" onClick={handleDevSession}>
                Continue as guest
              </button>
            </section>
          </>
        ) : null}

        {!isAuth0Available && !isDevAuthBypass ? (
          <section className="auth-alt-card auth-alt-card-muted">
            <h3>Sign-in unavailable</h3>
            <p>Please try again later.</p>
          </section>
        ) : null}
      </section>
    </main>
  )
}
