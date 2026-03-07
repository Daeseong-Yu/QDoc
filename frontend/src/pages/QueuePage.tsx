import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { CustomerShell } from '../components/CustomerShell'
import { getHospitalQueueSnapshotById } from '../services/hospitalService'
import { subscribeQueueRealtime } from '../services/queueRealtimeService'
import { getLatestActiveTicket, getQueueTicketById } from '../services/queueService'
import type { QueueTicket } from '../types/queue'

export function QueuePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const ticketId = searchParams.get('ticketId') ?? ''

  const [searchKeyword, setSearchKeyword] = useState('')
  const [ticket, setTicket] = useState<QueueTicket | null>(null)
  const [hospitalPhone, setHospitalPhone] = useState('')
  const [lastUpdatedAt, setLastUpdatedAt] = useState('')
  const [connectionUnstable, setConnectionUnstable] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadTicket() {
      setIsLoading(true)
      setError(null)

      try {
        const loadedTicket = ticketId ? await getQueueTicketById(ticketId) : await getLatestActiveTicket()

        if (cancelled) {
          return
        }

        if (!loadedTicket) {
          setTicket(null)
          setError('No active check-in found.')
          return
        }

        setTicket(loadedTicket)
        setLastUpdatedAt(loadedTicket.updatedAt)
      } catch {
        if (!cancelled) {
          setError('Unable to load your queue status.')
          setTicket(null)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadTicket()

    return () => {
      cancelled = true
    }
  }, [ticketId])

  useEffect(() => {
    let cancelled = false

    async function loadHospitalPhone() {
      if (!ticket?.hospitalId) {
        setHospitalPhone('')
        return
      }

      try {
        const hospital = await getHospitalQueueSnapshotById(ticket.hospitalId)
        if (!cancelled && hospital) {
          setHospitalPhone(hospital.phone)
        }
      } catch {
        if (!cancelled) {
          setHospitalPhone('')
        }
      }
    }

    void loadHospitalPhone()

    return () => {
      cancelled = true
    }
  }, [ticket?.hospitalId])

  useEffect(() => {
    if (!ticket?.id) {
      return
    }

    const controller = subscribeQueueRealtime(ticket.id, {
      onConnectionChange: (meta) => {
        setConnectionUnstable(meta.unstable)
      },
      onTicketUpdate: (next, meta) => {
        setTicket(next)
        setConnectionUnstable(meta.unstable)
        setLastUpdatedAt(next.updatedAt)
      },
    })

    return () => {
      controller.unsubscribe()
    }
  }, [ticket?.id])

  function handleRefresh() {
    if (!ticket?.id) {
      return
    }

    navigate(`/queue/status?ticketId=${encodeURIComponent(ticket.id)}`, { replace: true })
  }

  const waitingCount = ticket?.peopleAhead ?? 0

  return (
    <CustomerShell
      activeMenu="hospitals"
      searchKeyword={searchKeyword}
      onSearchKeywordChange={setSearchKeyword}
      onSearchSubmit={() => navigate(`/hospitals?keyword=${encodeURIComponent(searchKeyword.trim())}`)}
    >
      <section className="home-section-card queue-highlight-card">
        <header className="flow-header">
          <p className="flow-step">Live queue status</p>
          <h2>
            {ticket
              ? `${ticket.targetName}, ${waitingCount} people are ahead of you`
              : 'Checking your queue status'}
          </h2>
          <p>
            {ticket
              ? 'Please get ready when the line reaches 5 people ahead.'
              : 'Please wait while we load your latest ticket.'}
          </p>
        </header>

        <div className="flow-inline-actions">
          <button type="button" className="ghost-button" onClick={() => navigate('/')}>
            Back to Home
          </button>
          <button type="button" className="ghost-button" onClick={handleRefresh} disabled={!ticket?.id}>
            Refresh
          </button>
          {hospitalPhone ? (
            <a className="primary-link-button" href={`tel:${hospitalPhone}`}>
              Call Hospital
            </a>
          ) : null}
        </div>
      </section>

      {isLoading ? <p className="customer-muted">Loading your check-in status...</p> : null}

      {error ? (
        <section className="home-section-card">
          <p className="customer-error">{error}</p>
          <Link to="/hospitals" className="inline-link">
            Go to hospital search
          </Link>
        </section>
      ) : null}

      {ticket ? (
        <>
          <section className="home-section-card">
            <h3>Queue updates</h3>
            <p>Queue order can change based on hospital operations.</p>
            <p className="customer-muted">
              Live updates: {connectionUnstable ? 'Polling fallback' : 'Connected'} | Last update{' '}
              {lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString() : '-'}
            </p>
          </section>

          <section className="home-section-card">
            <h3>Check-in details</h3>
            <dl className="queue-detail-grid">
              <div>
                <dt>Checked in</dt>
                <dd>{new Date(ticket.createdAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt>Patient</dt>
                <dd>{ticket.targetName}</dd>
              </div>
              <div>
                <dt>Queue number</dt>
                <dd>{ticket.queueNumber}</dd>
              </div>
              <div>
                <dt>Hospital</dt>
                <dd>{ticket.hospitalName}</dd>
              </div>
            </dl>
          </section>
        </>
      ) : null}
    </CustomerShell>
  )
}
