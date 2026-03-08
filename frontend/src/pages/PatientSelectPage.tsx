import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { CustomerShell } from '../components/CustomerShell'
import { useAuth } from '../features/auth/useAuth'
import { getHospitalQueueSnapshotById } from '../services/hospitalService'

export function PatientSelectPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { session } = useAuth()

  const hospitalId = searchParams.get('hospitalId') ?? ''

  const [searchKeyword, setSearchKeyword] = useState('')
  const [hospitalName, setHospitalName] = useState('Selected hospital')

  useEffect(() => {
    if (!hospitalId) {
      navigate('/hospitals', { replace: true })
      return
    }

    let cancelled = false

    async function loadHospitalName() {
      try {
        const hospital = await getHospitalQueueSnapshotById(hospitalId)
        if (!cancelled && hospital) {
          setHospitalName(hospital.name)
        }
      } catch {
        if (!cancelled) {
          setHospitalName('Selected hospital')
        }
      }
    }

    void loadHospitalName()

    return () => {
      cancelled = true
    }
  }, [hospitalId, navigate])

  function moveToRoomSelection() {
    if (!hospitalId) {
      return
    }

    const params = new URLSearchParams({
      hospitalId,
      patientId: 'self',
      patientName: session?.user.name ?? 'Self',
    })

    navigate(`/queue/room?${params.toString()}`)
  }

  return (
    <CustomerShell
      activeMenu="hospitals"
      searchKeyword={searchKeyword}
      onSearchKeywordChange={setSearchKeyword}
      onSearchSubmit={() => navigate(`/hospitals?keyword=${encodeURIComponent(searchKeyword.trim())}`)}
    >
      <section className="home-section-card">
        <header className="flow-header">
          <p className="flow-step">Queue registration</p>
          <h2>Who is the patient?</h2>
          <p>Hospital: {hospitalName}</p>
        </header>

        <section className="flow-option-list">
          <article className="flow-option-card selected">
            <div className="flow-avatar" aria-hidden="true">
              ◉
            </div>
            <div className="flow-meta">
              <strong>{session?.user.name ?? 'Self'}</strong>
              <span>Self</span>
            </div>
          </article>
        </section>

        <div className="flow-inline-actions">
          <button type="button" className="ghost-button" disabled>
            + Add child (coming soon)
          </button>
          <button type="button" className="primary-button" disabled={!hospitalId} onClick={moveToRoomSelection}>
            Next
          </button>
        </div>
      </section>
    </CustomerShell>
  )
}
