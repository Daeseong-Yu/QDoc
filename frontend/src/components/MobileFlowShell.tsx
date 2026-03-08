import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

type MobileFlowShellProps = {
  title: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  actionLabel?: string
  actionDisabled?: boolean
  onAction?: () => void
  rightAction?: ReactNode
}

export function MobileFlowShell({
  title,
  subtitle,
  children,
  actionLabel,
  actionDisabled,
  onAction,
  rightAction,
}: MobileFlowShellProps) {
  const navigate = useNavigate()

  return (
    <main className="mobile-stage">
      <section className="mobile-device" aria-label="Mobile check-in flow">
        <div className="mobile-status-bar" aria-hidden="true">
          <span className="mobile-status-time">7:27</span>
          <span className="mobile-status-icons">LTE 91%</span>
        </div>

        <header className="mobile-top-bar">
          <button type="button" className="mobile-icon-button" onClick={() => navigate(-1)}>
            ←
          </button>
          {rightAction ? <div>{rightAction}</div> : <span className="mobile-top-placeholder" aria-hidden="true" />}
        </header>

        <div className="mobile-scroll-area">
          <section className="mobile-title-block">
            <h1>{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
          </section>

          {children}
        </div>

        {actionLabel ? (
          <footer className="mobile-footer">
            <button type="button" className="mobile-next-button" onClick={onAction} disabled={actionDisabled}>
              {actionLabel}
            </button>
          </footer>
        ) : null}
      </section>
    </main>
  )
}
