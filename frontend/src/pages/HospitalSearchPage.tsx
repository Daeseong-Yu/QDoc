import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { CustomerShell } from '../components/CustomerShell'
import { useOnboarding } from '../features/onboarding/useOnboarding'
import { searchNearbyHospitals } from '../services/hospitalService'
import type { HospitalOverview, HospitalSearchSort, OperatingStatus } from '../types/hospital'

const DEMO_LOCATION = {
  lat: 43.6532,
  lng: -79.3832,
}

const SEARCH_RADIUS_KM = 8

const STATUS_TEXT: Record<OperatingStatus, string> = {
  open: 'Open for check-in',
  closing_soon: 'Closing soon',
  paused: 'Check-in paused',
  closed: 'Closed',
}

const SORT_OPTIONS: Array<{ value: HospitalSearchSort; label: string }> = [
  { value: 'distance', label: 'Distance' },
  { value: 'wait', label: 'Shortest wait' },
  { value: 'status', label: 'Open first' },
]

function formatDistance(distanceKm: number) {
  const meter = Math.round(distanceKm * 1000)
  return `${Math.max(meter, 1)} m`
}

function formatStartTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function HospitalSearchPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { contract, completeHospitalStep } = useOnboarding()

  const [searchKeyword, setSearchKeyword] = useState(searchParams.get('keyword') ?? '')
  const [departmentFilter] = useState(searchParams.get('departmentName') ?? contract.recommendedDepartment)
  const [sortBy, setSortBy] = useState<HospitalSearchSort>('distance')
  const [results, setResults] = useState<HospitalOverview[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const nextParams = new URLSearchParams()

    if (searchKeyword.trim()) {
      nextParams.set('keyword', searchKeyword.trim())
    }

    if (departmentFilter.trim()) {
      nextParams.set('departmentName', departmentFilter.trim())
    }

    setSearchParams(nextParams, { replace: true })

    let cancelled = false

    async function loadHospitals() {
      try {
        const value = await searchNearbyHospitals({
          lat: DEMO_LOCATION.lat,
          lng: DEMO_LOCATION.lng,
          radiusKm: SEARCH_RADIUS_KM,
          departmentName: departmentFilter.trim() || undefined,
          keyword: searchKeyword.trim() || undefined,
          sortBy,
        })

        if (!cancelled) {
          setResults(value)
          setError(null)
        }
      } catch {
        if (!cancelled) {
          setResults([])
          setError('Unable to load hospitals. Please try again.')
        }
      }
    }

    void loadHospitals()

    return () => {
      cancelled = true
    }
  }, [departmentFilter, searchKeyword, setSearchParams, sortBy])

  const quickChips = useMemo(() => {
    const base = ['Open now', 'Walk-in', 'Weekend', 'Evening care']
    if (searchKeyword.trim()) {
      return [...base, searchKeyword.trim()]
    }

    return base
  }, [searchKeyword])

  function moveToQueueRegistration(hospital: HospitalOverview) {
    completeHospitalStep(hospital.id)

    const params = new URLSearchParams({
      hospitalId: hospital.id,
    })

    navigate(`/queue/patient?${params.toString()}`)
  }

  return (
    <CustomerShell
      activeMenu="hospitals"
      searchKeyword={searchKeyword}
      onSearchKeywordChange={setSearchKeyword}
      onSearchSubmit={() => {
        setSearchKeyword((current) => current.trim())
      }}
    >
      <section className="hospital-top-line">
        <h2 className="hospital-title-with-icon">Nearby Hospitals</h2>
        <div className="hospital-top-controls">
          <label className="header-drop">
            Sort
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as HospitalSearchSort)}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="hospital-filter-chips" aria-label="Search filters">
        {quickChips.map((chip) => (
          <button
            key={chip}
            type="button"
            className={`hospital-filter-chip${searchKeyword.trim() === chip ? ' active' : ''}`}
            onClick={() => setSearchKeyword(chip)}
          >
            {chip}
          </button>
        ))}
      </section>

      {error ? <p className="customer-error">{error}</p> : null}

      {!results.length ? (
        <section className="home-section-card">
          <p className="customer-muted">No hospitals found for this search.</p>
        </section>
      ) : null}

      <section className="hospital-result-list">
        {results.map((hospital) => {
          const reviews = 10 + (hospital.currentWaiting % 20)
          const rating = (4.2 + (hospital.currentWaiting % 4) * 0.2).toFixed(1)

          return (
            <article key={hospital.id} className="hospital-list-item">
              <div className="hospital-list-info">
                <h3>{hospital.name}</h3>
                <p className="hospital-open-line">
                  {STATUS_TEXT[hospital.operatingStatus]} | Updates at {formatStartTime(hospital.lastUpdatedAt)}
                </p>
                <p className="hospital-meta-line">
                  <strong>{formatDistance(hospital.distanceKm)}</strong> | {hospital.address}
                </p>
                <p className="hospital-rating-line">
                  Rating {rating} | {reviews} reviews | {hospital.currentWaiting} waiting
                </p>
              </div>

              <div className="hospital-list-side">
                <div className="hospital-thumbnail" aria-hidden="true">
                  {hospital.name.slice(0, 1)}
                </div>
                <button
                  type="button"
                  className="hospital-list-action"
                  onClick={() => moveToQueueRegistration(hospital)}
                >
                  Check in
                </button>
              </div>
            </article>
          )
        })}
      </section>
    </CustomerShell>
  )
}
