import { ApiError, apiRequest, getCurrentSessionUser, toApiErrorMessage } from './apiClient'
import type { QueueEnrollErrorCode, QueueEnrollInput, QueueTicket, QueueTicketStatus } from '../types/queue'

const ACTIVE_STATUSES: QueueTicketStatus[] = ['Waiting', 'Called', 'InService']
const QUEUE_TICKET_CHANGED_EVENT = 'qdoc:queue-ticket-changed'

type ApiWait = {
  peopleAhead: number
  avgMin: number
  estimatedWaitMin: number
}

type ApiQueueTicket = {
  id: string
  queueId: string
  familyMemberId: string | null
  status: QueueTicketStatus
  ticketNumber: number
  cancelledReason: string | null
  createdAt: string
  updatedAt: string
  queue?: {
    id: string
    avgMin?: number
    hospital?: {
      id: string
      name: string
    }
  }
  familyMember?: {
    id: string
    name: string
  } | null
  wait?: ApiWait | null
}

type ApiEnrollResponse = {
  ticket: {
    id: string
    ticketNumber: number
    familyMemberId: string | null
    status: QueueTicketStatus
    createdAt: string
    updatedAt: string
    cancelledReason: string | null
  }
  wait: ApiWait
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

type TicketFallback = {
  hospitalId?: string
  hospitalName?: string
  targetName?: string
  targetType?: 'self' | 'family'
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

function mapTicket(record: ApiQueueTicket, fallback?: TicketFallback): QueueTicket {
  const sessionUser = getCurrentSessionUser()

  const wait = record.wait ?? {
    peopleAhead: 0,
    avgMin: record.queue?.avgMin ?? 5,
    estimatedWaitMin: 0,
  }

  const targetType =
    fallback?.targetType ?? (record.familyMemberId || record.familyMember ? 'family' : 'self')

  const targetName =
    fallback?.targetName ??
    (targetType === 'family' ? record.familyMember?.name ?? 'Family Member' : sessionUser?.name ?? 'Self')

  return {
    id: record.id,
    hospitalId: record.queue?.hospital?.id ?? fallback?.hospitalId ?? '',
    hospitalName: record.queue?.hospital?.name ?? fallback?.hospitalName ?? 'Hospital',
    queueNumber: record.ticketNumber,
    targetType,
    targetName,
    familyMemberId: record.familyMemberId,
    status: record.status,
    peopleAhead: wait.peopleAhead,
    avgMin: wait.avgMin,
    estimatedWaitMin: wait.estimatedWaitMin,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    cancelledReason: record.cancelledReason,
  }
}

function mapEnrollError(error: unknown) {
  if (!(error instanceof ApiError)) {
    return new QueueServiceError('INVALID_TARGET', toApiErrorMessage(error, 'Queue enrollment failed.'))
  }

  const message = toApiErrorMessage(error, 'Queue enrollment failed.')

  if (error.status === 404) {
    return new QueueServiceError('HOSPITAL_NOT_FOUND', message)
  }

  if (error.status === 409) {
    return new QueueServiceError('DUPLICATE_ACTIVE_TICKET', message)
  }

  if (error.status === 400 && message.toLowerCase().includes('queue')) {
    return new QueueServiceError('QUEUE_UNAVAILABLE', message)
  }

  return new QueueServiceError('INVALID_TARGET', message)
}

export function subscribeQueueTicketChanges(handler: () => void) {
  if (typeof window === 'undefined') {
    return () => undefined
  }

  window.addEventListener(QUEUE_TICKET_CHANGED_EVENT, handler)
  return () => window.removeEventListener(QUEUE_TICKET_CHANGED_EVENT, handler)
}

export async function listQueueTickets() {
  const result = await apiRequest<ApiQueueTicket[]>('/queues/my/tickets')
  return result.map((item) => mapTicket(item)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

export async function getQueueTicketById(id: string) {
  try {
    const result = await apiRequest<ApiQueueTicket>(`/queues/tickets/${encodeURIComponent(id)}`)
    return mapTicket(result)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null
    }

    throw error
  }
}

export async function getActiveTicketByHospitalId(hospitalId: string) {
  const tickets = await listQueueTickets()
  return tickets.find((ticket) => ticket.hospitalId === hospitalId && isActive(ticket.status)) ?? null
}

export async function getLatestActiveTicket() {
  const tickets = await listQueueTickets()
  return tickets.find((ticket) => isActive(ticket.status)) ?? null
}

export async function enrollQueue(input: QueueEnrollInput) {
  if (!input.targetName.trim()) {
    throw new QueueServiceError('INVALID_TARGET', 'Please select a valid target.')
  }

  if (input.targetType === 'family' && !input.familyMemberId) {
    throw new QueueServiceError('INVALID_TARGET', 'Family target requires a family member selection.')
  }

  try {
    const result = await apiRequest<ApiEnrollResponse>('/queues/tickets/enroll', {
      method: 'POST',
      body: JSON.stringify({
        hospitalId: input.hospitalId,
        departmentId: input.departmentId,
        targetType: input.targetType,
        targetName: input.targetName,
        familyMemberId: input.familyMemberId,
      }),
    })

    const hydrated = await getQueueTicketById(result.ticket.id)
    if (hydrated) {
      notifyQueueTicketChanged()
      return hydrated
    }

    const fallbackTicket = mapTicket(
      {
        id: result.ticket.id,
        queueId: '',
        familyMemberId: result.ticket.familyMemberId,
        status: result.ticket.status,
        ticketNumber: result.ticket.ticketNumber,
        cancelledReason: result.ticket.cancelledReason,
        createdAt: result.ticket.createdAt,
        updatedAt: result.ticket.updatedAt,
        wait: result.wait,
      },
      {
        hospitalId: input.hospitalId,
        hospitalName: 'Hospital',
        targetName: input.targetName,
        targetType: input.targetType,
      },
    )

    notifyQueueTicketChanged()
    return fallbackTicket
  } catch (error) {
    throw mapEnrollError(error)
  }
}

export async function cancelQueueTicket(ticketId: string, reason: string) {
  await apiRequest(`/queues/tickets/${encodeURIComponent(ticketId)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })

  notifyQueueTicketChanged()
  return getQueueTicketById(ticketId)
}
