import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { CustomerShell } from '../components/CustomerShell'
import { useAuth } from '../features/auth/useAuth'
import { useOnboarding } from '../features/onboarding/useOnboarding'
import { createFamilyMember, deleteFamilyMember, listFamilyMembers } from '../services/familyService'
import type { FamilyMember, FamilyMemberInput } from '../types/family'

const EMPTY_FORM: FamilyMemberInput = {
  name: '',
  birthDate: '',
  relation: '',
  contact: '',
}

export function FamilyPage() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const { completeFamilyStep } = useOnboarding()

  const [searchKeyword, setSearchKeyword] = useState('')
  const [members, setMembers] = useState<FamilyMember[]>(() => listFamilyMembers())
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FamilyMemberInput>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)

  function proceedToSymptoms() {
    completeFamilyStep()
    navigate('/symptoms')
  }

  function resetForm() {
    setForm(EMPTY_FORM)
    setError(null)
    setShowForm(false)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!form.name.trim() || !form.relation.trim()) {
      setError('Name and relation are required.')
      return
    }

    createFamilyMember(form)
    setMembers(listFamilyMembers())
    resetForm()
  }

  function handleDelete(memberId: string) {
    deleteFamilyMember(memberId)
    setMembers(listFamilyMembers())
  }

  return (
    <CustomerShell
      activeMenu="home"
      searchKeyword={searchKeyword}
      onSearchKeywordChange={setSearchKeyword}
      onSearchSubmit={() => navigate(`/hospitals?keyword=${encodeURIComponent(searchKeyword.trim())}`)}
    >
      <section className="home-section-card">
        <header className="flow-header">
          <p className="flow-step">Step 1 of 4</p>
          <h2>Select patient</h2>
          <p>MVP queue registration is self-target only. Family members are optional references.</p>
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

          {members.map((member) => (
            <article key={member.id} className="flow-option-card">
              <div className="flow-avatar" aria-hidden="true">
                ◌
              </div>
              <div className="flow-meta">
                <strong>{member.name}</strong>
                <span>
                  {member.relation}
                  {member.birthDate ? ` · ${member.birthDate}` : ''}
                </span>
              </div>
              <button
                type="button"
                className="flow-inline-delete"
                onClick={() => handleDelete(member.id)}
                aria-label={`Delete ${member.name}`}
              >
                Delete
              </button>
            </article>
          ))}
        </section>

        <div className="flow-inline-actions">
          <button type="button" className="ghost-button" onClick={() => setShowForm((current) => !current)}>
            {showForm ? 'Cancel add member' : '+ Add family member'}
          </button>
          <button type="button" className="primary-button" onClick={proceedToSymptoms}>
            Continue to Symptoms
          </button>
        </div>
      </section>

      {showForm ? (
        <section className="home-section-card">
          <h3>Add family member</h3>
          <form className="family-inline-form" onSubmit={handleSubmit}>
            <label>
              Name
              <input
                type="text"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Jamie Kim"
              />
            </label>

            <label>
              Relation
              <input
                type="text"
                value={form.relation}
                onChange={(event) => setForm((current) => ({ ...current, relation: event.target.value }))}
                placeholder="Child, Parent"
              />
            </label>

            <label>
              Birth Date (optional)
              <input
                type="date"
                value={form.birthDate}
                onChange={(event) => setForm((current) => ({ ...current, birthDate: event.target.value }))}
              />
            </label>

            <label>
              Contact (optional)
              <input
                type="text"
                value={form.contact}
                onChange={(event) => setForm((current) => ({ ...current, contact: event.target.value }))}
                placeholder="+1-416-555-0199"
              />
            </label>

            <div className="family-inline-actions">
              <button type="submit" className="primary-button">
                Save member
              </button>
              <button type="button" className="ghost-button" onClick={resetForm}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {error ? <p className="customer-error">{error}</p> : null}
    </CustomerShell>
  )
}
