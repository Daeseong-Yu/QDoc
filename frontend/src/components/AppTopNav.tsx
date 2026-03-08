import { NavLink } from 'react-router-dom'

import { useAuth } from '../features/auth/useAuth'

const NAV_ITEMS = [
  { to: '/family', label: 'Family' },
  { to: '/symptoms', label: 'Symptoms' },
  { to: '/hospitals', label: 'Hospitals' },
  { to: '/queue', label: 'My Queue' },
]

export function AppTopNav() {
  const { session } = useAuth()

  return (
    <header className="app-topbar">
      <div className="brand-block">
        <p className="brand-kicker">QDoc</p>
        <h1 className="brand-title">Hospital Queue App</h1>
      </div>

      <nav className="nav-links" aria-label="Primary navigation">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/family'}
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="session-chip" title={session?.user.email}>
        <span>{session?.user.name ?? 'Guest'}</span>
        <small>My Account</small>
      </div>
    </header>
  )
}
