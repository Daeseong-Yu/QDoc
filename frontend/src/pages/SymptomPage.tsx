import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { CustomerShell } from '../components/CustomerShell'
import { useOnboarding } from '../features/onboarding/useOnboarding'
import { analyzeSymptomText } from '../services/symptomService'

const DISCLAIMER_TEXT =
  'AI health consult is guidance only and not a diagnosis. For severe pain, breathing issues, or emergency symptoms, call emergency services immediately.'

export function SymptomPage() {
  const navigate = useNavigate()
  const { contract, completeSymptomStep } = useOnboarding()

  const [searchKeyword, setSearchKeyword] = useState('')
  const [input, setInput] = useState(contract.symptomText)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!input.trim() && contract.symptomText.trim()) {
      setInput(contract.symptomText)
    }
  }, [contract.symptomText, input])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const normalized = input.trim()
    if (!normalized) {
      setError('Please enter your symptoms.')
      return
    }

    setError(null)
    setIsSubmitting(true)

    try {
      const analyzed = await analyzeSymptomText(normalized)
      completeSymptomStep({
        symptomText: normalized,
        recommendedDepartment: analyzed.recommendedDepartment,
      })

      const params = new URLSearchParams()
      if (analyzed.recommendedDepartment.trim()) {
        params.set('departmentName', analyzed.recommendedDepartment.trim())
      }

      navigate(`/hospitals${params.toString() ? `?${params.toString()}` : ''}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to analyze symptoms right now. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <CustomerShell
      activeMenu="ai"
      searchKeyword={searchKeyword}
      onSearchKeywordChange={setSearchKeyword}
      onSearchSubmit={() => navigate(`/hospitals?keyword=${encodeURIComponent(searchKeyword.trim())}`)}
    >
      <section className="home-section-card">
        <header>
          <h2>AI Health Consult</h2>
          <p>Describe your symptoms to get a care summary and guidance.</p>
        </header>

        <form className="ai-consult-form" onSubmit={handleSubmit}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Example: sore throat and fever for 2 days"
            rows={5}
          />
          <button type="submit" className="primary-button" disabled={isSubmitting}>
            {isSubmitting ? 'Analyzing...' : 'Continue to Hospital Search'}
          </button>
        </form>

        <p className="customer-muted">{DISCLAIMER_TEXT}</p>
      </section>

      {error ? <p className="customer-error">{error}</p> : null}
    </CustomerShell>
  )
}
