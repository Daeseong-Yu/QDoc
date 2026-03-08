import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { CustomerShell } from '../components/CustomerShell'
import { getLatestActiveTicket, subscribeQueueTicketChanges } from '../services/queueService'
import type { QueueTicket } from '../types/queue'

const QUICK_CHIPS = ['Open now', 'Weekend care', 'HPV vaccine', 'Flu shot']

export function HomePage() {
  const navigate = useNavigate()

  const [searchKeyword, setSearchKeyword] = useState('')
  const [activeTicket, setActiveTicket] = useState<QueueTicket | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadActiveTicket() {
      try {
        const ticket = await getLatestActiveTicket()
        if (!cancelled) {
          setActiveTicket(ticket)
        }
      } catch {
        if (!cancelled) {
          setActiveTicket(null)
        }
      }
    }

    void loadActiveTicket()

    const timer = window.setInterval(() => {
      void loadActiveTicket()
    }, 15000)

    const unsubscribe = subscribeQueueTicketChanges(() => {
      void loadActiveTicket()
    })

    return () => {
      cancelled = true
      window.clearInterval(timer)
      unsubscribe()
    }
  }, [])

  function moveToHospitalSearch(keyword = searchKeyword) {
    const normalized = keyword.trim()
    if (!normalized) {
      navigate('/hospitals')
      return
    }

    navigate(`/hospitals?keyword=${encodeURIComponent(normalized)}`)
  }

  return (
    <CustomerShell
      activeMenu="home"
      searchKeyword={searchKeyword}
      onSearchKeywordChange={setSearchKeyword}
      onSearchSubmit={() => moveToHospitalSearch()}
    >
      <section className="home-hero-card">
        <div className="hero-copy">
          <p className="hero-kicker">Need care after work?</p>
          <h2>Find a nearby clinic and join the queue fast</h2>
        </div>
        <div className="hero-illustration" aria-hidden="true">
          <div className="hero-bed">
            <span>☎</span>
          </div>
        </div>
      </section>

      <div className="hero-pagination" aria-hidden="true">
        <span className="active" />
        <span />
        <span />
      </div>

      <section className="home-chip-row" aria-label="Quick filters">
        {QUICK_CHIPS.map((chip) => (
          <button key={chip} type="button" onClick={() => moveToHospitalSearch(chip)}>
            {chip}
          </button>
        ))}
      </section>

      <section className={`home-queue-summary${activeTicket ? ' active' : ''}`}>
        <div className="home-queue-summary-copy">
          <p className="home-queue-summary-label">My queue status</p>
          {activeTicket ? (
            <>
              <strong>{activeTicket.peopleAhead} people are ahead of you</strong>
              <span>
                {activeTicket.hospitalName} · ETA {activeTicket.estimatedWaitMin} min · Queue #{activeTicket.queueNumber}
              </span>
            </>
          ) : (
            <>
              <strong>No active check-in right now</strong>
              <span>Once you check in, your live queue position will appear here.</span>
            </>
          )}
        </div>

        {activeTicket ? (
          <button
            type="button"
            className="home-queue-summary-action"
            onClick={() => navigate(`/queue/status?ticketId=${encodeURIComponent(activeTicket.id)}`)}
          >
            View live queue
          </button>
        ) : (
          <button type="button" className="home-queue-summary-action" onClick={() => navigate('/hospitals')}>
            Find hospitals
          </button>
        )}
      </section>
    </CustomerShell>
  )
}
