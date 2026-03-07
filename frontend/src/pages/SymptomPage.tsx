import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { CustomerShell } from '../components/CustomerShell'

export function SymptomPage() {
  const navigate = useNavigate()
  const [searchKeyword, setSearchKeyword] = useState('')

  return (
    <CustomerShell
      activeMenu="ai"
      searchKeyword={searchKeyword}
      onSearchKeywordChange={setSearchKeyword}
      onSearchSubmit={() => navigate('/hospitals')}
    >
      <section className="home-section-card">
        <header>
          <h2>AI Health Consult</h2>
          <p>Symptom guidance will be added in the next step.</p>
        </header>
        <button type="button" className="primary-button" onClick={() => navigate('/')}>
          Back to home
        </button>
      </section>
    </CustomerShell>
  )
}
