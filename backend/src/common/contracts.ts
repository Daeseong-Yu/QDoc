export const WS_EVENTS = {
  queueUpdated: 'queue.updated',
  ticketCalled: 'ticket.called',
  ticketCancelled: 'ticket.cancelled',
} as const

export const QUEUE_STATUSES = ['Open', 'Paused', 'Closed'] as const
export type QueueStatus = (typeof QUEUE_STATUSES)[number]
export const OPEN_QUEUE_STATUS: QueueStatus = 'Open'

export const ACTIVE_TICKET_STATUSES = ['Waiting', 'Called', 'InService'] as const
export type ActiveQueueTicketStatus = (typeof ACTIVE_TICKET_STATUSES)[number]
