import type { FamilyMember, FamilyMemberInput } from '../types/family'

const FAMILY_KEY = 'qdoc.family.members'

function loadMembers(): FamilyMember[] {
  if (typeof window === 'undefined') {
    return []
  }

  const raw = window.localStorage.getItem(FAMILY_KEY)
  if (!raw) {
    return []
  }

  try {
    return JSON.parse(raw) as FamilyMember[]
  } catch {
    window.localStorage.removeItem(FAMILY_KEY)
    return []
  }
}

function saveMembers(items: FamilyMember[]) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(FAMILY_KEY, JSON.stringify(items))
}

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `fam-${Date.now()}-${Math.round(Math.random() * 1000)}`
}

export function listFamilyMembers() {
  return loadMembers().sort((a, b) => a.name.localeCompare(b.name))
}

export function getFamilyMemberById(id: string) {
  return loadMembers().find((member) => member.id === id) ?? null
}

export function createFamilyMember(input: FamilyMemberInput) {
  const next: FamilyMember = {
    id: createId(),
    name: input.name.trim(),
    birthDate: input.birthDate,
    relation: input.relation.trim(),
    contact: input.contact.trim(),
  }

  const current = loadMembers()
  saveMembers([...current, next])
  return next
}

export function updateFamilyMember(id: string, input: FamilyMemberInput) {
  const current = loadMembers()
  const index = current.findIndex((member) => member.id === id)

  if (index < 0) {
    return null
  }

  const updated: FamilyMember = {
    ...current[index],
    name: input.name.trim(),
    birthDate: input.birthDate,
    relation: input.relation.trim(),
    contact: input.contact.trim(),
  }

  const next = [...current]
  next[index] = updated
  saveMembers(next)
  return updated
}

export function deleteFamilyMember(id: string) {
  const current = loadMembers()
  const next = current.filter((member) => member.id !== id)
  saveMembers(next)
}
