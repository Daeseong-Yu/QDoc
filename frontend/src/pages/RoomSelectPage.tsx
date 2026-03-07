import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

export function RoomSelectPage() {
  const [searchParams] = useSearchParams()

  const details = useMemo(
    () => ({
      hospitalId: searchParams.get('hospitalId') ?? '',
      patientName: searchParams.get('patientName') ?? 'Self',
    }),
    [searchParams],
  )

  return (
    <main className="auth-layout">
      <section className="auth-card">
        <p className="brand-kicker">QDoc</p>
        <h2>Queue registration</h2>
        <p className="muted">Selected patient: {details.patientName}</p>
        <p className="muted">Selected hospital: {details.hospitalId || 'Not provided'}</p>
        <p className="muted">Room and check-in details will be added in the next step.</p>
        <Link to="/hospitals" className="ghost-button auth-alt-button">
          Back to hospital search
        </Link>
      </section>
    </main>
  )
}
