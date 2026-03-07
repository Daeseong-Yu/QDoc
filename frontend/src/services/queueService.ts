import type { QueueEnrollErrorCode, QueueEnrollInput, QueueTicket, QueueTicketStatus } from '../types/queue'
import { getHospitalQueueSnapshotById } from './hospitalService'

const QUEUE_STORAGE_KEY = 'qdoc.queue.tickets'
const QUEUE_TICKET_CHANGED_EVENT = 'qdoc:queue-ticket-changed'
const ACTIVE_STATUSES: QueueTicketStatus[] = ['Waiting', 'Called', 'InService']

export class QueueServiceError extends Error {
  readonly code: QueueEnrollErrorCode

  constructor(code: QueueEnrollErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'QueueServiceError'
  }
}

function getStorage() {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage
}

function loadTickets(): QueueTicket[] {
  const storage = getStorage()
  if (!storage) {
    return []
  }

  const raw = storage.getItem(QUEUE_STORAGE_KEY)
  if (!raw) {
    return []
  }

  try {
    return JSON.parse(raw) as QueueTicket[]
  } catch {
    storage.removeItem(QUEUE_STORAGE_KEY)
    return []
  }
}

function saveTickets(tickets: QueueTicket[]) {
  const storage = getStorage()
  if (!storage) {
    return
  }

  storage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(tickets))
}

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `ticket-${Date.now()}-${Math.round(Math.random() * 1000)}`
}

function isActive(status: QueueTicketStatus) {
  return ACTIVE_STATUSES.includes(status)
}

function notifyQueueTicketChanged() {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new Event(QUEUE_TICKET_CHANGED_EVENT))
}

export function subscribeQueueTicketChanges(handler: () => void) {
  if (typeof window === 'undefined') {
    return () => undefined
  }

  window.addEventListener(QUEUE_TICKET_CHANGED_EVENT, handler)
  return () => window.removeEventListener(QUEUE_TICKET_CHANGED_EVENT, handler)
}

export async function getLatestActiveTicket(): Promise<QueueTicket | null> {
  const tickets = loadTickets().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  return tickets.find((ticket) => isActive(ticket.status)) ?? null
}

export async function getQueueTicketById(id: string): Promise<QueueTicket | null> {
  return loadTickets().find((ticket) => ticket.id === id) ?? null
}

export async function enrollQueue(input: QueueEnrollInput): Promise<QueueTicket> {
  if (!input.targetName.trim()) {
    throw new QueueServiceError('INVALID_TARGET', 'Please select a valid patient.')
  }

  if (input.targetType === 'family' && !input.familyMemberId) {
    throw new QueueServiceError('INVALID_TARGET', 'Family target requires a family member selection.')
  }

  const active = await getLatestActiveTicket()
  if (active) {
    throw new QueueServiceError('DUPLICATE_ACTIVE_TICKET', 'An active check-in already exists.')
  }

  const hospital = await getHospitalQueueSnapshotById(input.hospitalId)
  if (!hospital) {
    throw new QueueServiceError('HOSPITAL_NOT_FOUND', 'Selected hospital could not be found.')
  }

  const createdAt = new Date().toISOString()
  const queueNumber = Math.max(101, 100 + hospital.currentWaiting + 1)
  const avgMin = hospital.currentWaiting > 0 ? Math.max(4, Math.round(hospital.estimatedWaitMin / hospital.currentWaiting)) : 5

  const ticket: QueueTicket = {
    id: createId(),
    hospitalId: hospital.id,
    hospitalName: hospital.name,
    queueNumber,
    targetType: input.targetType,
    targetName: input.targetName,
    familyMemberId: input.familyMemberId,
    status: 'Waiting',
    peopleAhead: hospital.currentWaiting,
    avgMin,
    estimatedWaitMin: hospital.estimatedWaitMin,
    createdAt,
    updatedAt: createdAt,
    cancelledReason: null,
  }

  const tickets = loadTickets()
  saveTickets([...tickets, ticket])
  notifyQueueTicketChanged()
  return ticket
}
