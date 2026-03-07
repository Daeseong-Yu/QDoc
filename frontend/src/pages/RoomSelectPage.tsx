import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { CustomerShell } from '../components/CustomerShell'

export function RoomSelectPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [searchKeyword, setSearchKeyword] = useState('')

  const hospitalId = searchParams.get('hospitalId') ?? ''
  const patientName = searchParams.get('patientName') ?? 'Self'

  return (
    <CustomerShell
      activeMenu="hospitals"
      searchKeyword={searchKeyword}
      onSearchKeywordChange={setSearchKeyword}
      onSearchSubmit={() => navigate('/hospitals')}
    >
      <section className="home-section-card">
        <header>
          <h2>Queue registration</h2>
          <p>Hospital selection is complete. Room selection will be added in the next step.</p>
        </header>
        <p className="customer-muted">Hospital ID: {hospitalId || '-'}</p>
        <p className="customer-muted">Patient: {patientName}</p>
        <button type="button" className="primary-button" onClick={() => navigate('/hospitals')}>
          Back to hospitals
        </button>
      </section>
    </CustomerShell>
  )
}
