import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '../features/auth/useAuth'

export function ProtectedRoute() {
  const { isAuthenticated, isReady } = useAuth()
  const location = useLocation()

  if (!isReady) {
    return (
      <main className="auth-layout">
        <section className="auth-card">
          <p className="brand-kicker">QDoc</p>
          <h2>Checking your session</h2>
          <p className="muted">Please wait while we restore your sign-in state.</p>
        </section>
      </main>
    )
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: `${location.pathname}${location.search}`,
          reason: 'Please sign in to continue.',
        }}
      />
    )
  }

  return <Outlet />
}
