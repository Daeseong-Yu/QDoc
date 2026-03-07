import type { QueueEnrollErrorCode, QueueEnrollInput, QueueTicket, QueueTicketStatus } from '../types/queue'
import { getHospitalQueueSnapshotById } from './hospitalService'
import { ApiError, apiRequest, getStoredSession } from './apiClient'

const QUEUE_TICKET_CHANGED_EVENT = 'qdoc:queue-ticket-changed'
const ACTIVE_STATUSES: QueueTicketStatus[] = ['Waiting', 'Called', 'InService']

type BackendWaitSummary = {
  peopleAhead: number
  avgMin: number
  estimatedWaitMin: number
}

type BackendQueueTicket = {
  id: string
  queueId: string
  familyMemberId: string | null
  status: QueueTicketStatus
  ticketNumber: number
  cancelledReason: string | null
  createdAt: string
  updatedAt: string
  queue: {
    id: string
    avgMin: number
    hospital: {
      id: string
      name: string
    }
  }
  familyMember: {
    id: string
    name: string
  } | null
  wait: BackendWaitSummary
}

type BackendEnrollResponse = {
  ticket: {
    id: string
    ticketNumber: number
    familyMemberId: string | null
    status: QueueTicketStatus
    createdAt: string
    updatedAt: string
    cancelledReason: string | null
  }
  wait: BackendWaitSummary
  notifications: string[]
}

export class QueueServiceError extends Error {
  readonly code: QueueEnrollErrorCode

  constructor(code: QueueEnrollErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'QueueServiceError'
  }
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

function getCurrentUserName() {
  return getStoredSession()?.user?.name?.trim() || 'Self'
}

function mapQueueTicket(ticket: BackendQueueTicket): QueueTicket {
  return {
    id: ticket.id,
    hospitalId: ticket.queue.hospital.id,
    hospitalName: ticket.queue.hospital.name,
    queueNumber: ticket.ticketNumber,
    targetType: ticket.familyMember ? 'family' : 'self',
    targetName: ticket.familyMember?.name ?? getCurrentUserName(),
    familyMemberId: ticket.familyMemberId,
    status: ticket.status,
    peopleAhead: ticket.wait.peopleAhead,
    avgMin: ticket.wait.avgMin || ticket.queue.avgMin,
    estimatedWaitMin: ticket.wait.estimatedWaitMin,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    cancelledReason: ticket.cancelledReason,
  }
}

function toQueueServiceError(error: unknown): QueueServiceError {
  if (!(error instanceof ApiError)) {
    return new QueueServiceError('QUEUE_UNAVAILABLE', 'Unable to connect to queue service right now.')
  }

  const message = error.message || 'Queue request failed.'
  const normalized = message.toLowerCase()

  if (error.status === 404 && normalized.includes('hospital')) {
    return new QueueServiceError('HOSPITAL_NOT_FOUND', message)
  }

  if (normalized.includes('active queue ticket') || error.status === 409) {
    return new QueueServiceError('DUPLICATE_ACTIVE_TICKET', message)
  }

  if (normalized.includes('family') || normalized.includes('target')) {
    return new QueueServiceError('INVALID_TARGET', message)
  }

  if (
    normalized.includes('queue') ||
    normalized.includes('department') ||
    normalized.includes('hospital') ||
    error.status === 400 ||
    error.status === 404
  ) {
    return new QueueServiceError('QUEUE_UNAVAILABLE', message)
  }

  return new QueueServiceError('QUEUE_UNAVAILABLE', message)
}

export function subscribeQueueTicketChanges(handler: () => void) {
  if (typeof window === 'undefined') {
    return () => undefined
  }

  window.addEventListener(QUEUE_TICKET_CHANGED_EVENT, handler)
  return () => window.removeEventListener(QUEUE_TICKET_CHANGED_EVENT, handler)
}

export async function getLatestActiveTicket(): Promise<QueueTicket | null> {
  const tickets = await apiRequest<BackendQueueTicket[]>('/queues/my/tickets')
  const active = tickets.find((ticket) => isActive(ticket.status))
  return active ? mapQueueTicket(active) : null
}

export async function getQueueTicketById(id: string): Promise<QueueTicket | null> {
  try {
    const ticket = await apiRequest<BackendQueueTicket>(`/queues/tickets/${encodeURIComponent(id)}`)
    return mapQueueTicket(ticket)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null
    }

    throw error
  }
}

export async function enrollQueue(input: QueueEnrollInput): Promise<QueueTicket> {
  if (!input.targetName.trim()) {
    throw new QueueServiceError('INVALID_TARGET', 'Please select a valid patient.')
  }

  if (input.targetType === 'family' && !input.familyMemberId) {
    throw new QueueServiceError('INVALID_TARGET', 'Family target requires a family member selection.')
  }

  try {
    const response = await apiRequest<BackendEnrollResponse>('/queues/tickets/enroll', {
      body: {
        hospitalId: input.hospitalId,
        departmentId: input.departmentId,
        targetType: input.targetType,
        targetName: input.targetName,
        familyMemberId: input.familyMemberId ?? undefined,
      },
    })

    const hydrated = await getQueueTicketById(response.ticket.id)
    if (hydrated) {
      notifyQueueTicketChanged()
      return hydrated
    }

    const hospital = await getHospitalQueueSnapshotById(input.hospitalId)
    const fallback: QueueTicket = {
      id: response.ticket.id,
      hospitalId: input.hospitalId,
      hospitalName: hospital?.name ?? 'Selected hospital',
      queueNumber: response.ticket.ticketNumber,
      targetType: input.targetType,
      targetName: input.targetName,
      familyMemberId: response.ticket.familyMemberId,
      status: response.ticket.status,
      peopleAhead: response.wait.peopleAhead,
      avgMin: response.wait.avgMin,
      estimatedWaitMin: response.wait.estimatedWaitMin,
      createdAt: response.ticket.createdAt,
      updatedAt: response.ticket.updatedAt,
      cancelledReason: response.ticket.cancelledReason,
    }

    notifyQueueTicketChanged()
    return fallback
  } catch (error) {
    throw toQueueServiceError(error)
  }
}
