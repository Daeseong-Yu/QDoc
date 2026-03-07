import type { FormEvent, ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'

import { useAuth } from '../features/auth/useAuth'

type CustomerMenu = 'home' | 'hospitals' | 'ai'

type CustomerShellProps = {
  activeMenu: CustomerMenu
  searchKeyword: string
  onSearchKeywordChange: (value: string) => void
  onSearchSubmit: () => void
  children: ReactNode
}

type NavItem = {
  id: CustomerMenu
  label: string
  to: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', to: '/' },
  { id: 'hospitals', label: 'Find Hospitals', to: '/hospitals' },
  { id: 'ai', label: 'AI Health Consult', to: '/symptoms' },
]

export function CustomerShell({
  activeMenu,
  searchKeyword,
  onSearchKeywordChange,
  onSearchSubmit,
  children,
}: CustomerShellProps) {
  const navigate = useNavigate()
  const { authMethod, isAuthenticated, logout, session } = useAuth()

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSearchSubmit()
  }

  function handleAuthAction() {
    if (isAuthenticated) {
      logout('/login')

      if (authMethod !== 'auth0') {
        navigate('/login', { replace: true })
      }

      return
    }

    navigate('/login')
  }

  return (
    <main className="customer-app-shell">
      <header className="customer-header">
        <div className="customer-logo-wrap">
          <Link to="/" className="customer-logo" aria-label="Go to QDoc home">
            QDoc
          </Link>
        </div>

        <form className="customer-search-form" onSubmit={handleSearchSubmit}>
          <div className="customer-search-box">
            <span className="search-icon" aria-hidden="true">
              Search
            </span>
            <input
              type="text"
              value={searchKeyword}
              onChange={(event) => onSearchKeywordChange(event.target.value)}
              placeholder="Search city or hospital"
              aria-label="Search hospitals"
            />
            {searchKeyword ? (
              <button
                type="button"
                className="search-clear"
                aria-label="Clear search"
                onClick={() => onSearchKeywordChange('')}
              >
                Clear
              </button>
            ) : null}
          </div>
        </form>

        <div className="customer-header-actions">
          {isAuthenticated ? <span className="customer-account-name">{session?.user.name}</span> : null}
          <button type="button" className="ghost-button" onClick={handleAuthAction}>
            {isAuthenticated ? 'Sign out' : 'Sign in / Join'}
          </button>
        </div>
      </header>

      <div className="customer-main-grid">
        <aside className="customer-side-nav" aria-label="Customer menu">
          <ul>
            {NAV_ITEMS.map((item) => (
              <li key={item.id}>
                <NavLink
                  to={item.to}
                  className={`side-nav-item${item.id === activeMenu ? ' active' : ''}`}
                  end={item.to === '/'}
                >
                  <span>{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </aside>

        <section className="customer-content">{children}</section>
      </div>
    </main>
  )
}
