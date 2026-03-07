import { useAuth } from '../features/auth/useAuth'

export function HomePage() {
  const { session, logout } = useAuth()

  return (
    <main className="auth-layout">
      <section className="auth-card">
        <p className="brand-kicker">QDoc</p>
        <h2>Welcome</h2>
        <p className="muted">Signed in as {session?.user.name ?? 'User'}.</p>
        <button type="button" className="primary-button" onClick={() => logout('/login')}>
          Sign out
        </button>
      </section>
    </main>
  )
}
