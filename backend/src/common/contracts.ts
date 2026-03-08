export const WS_EVENTS = {
  queueUpdated: 'queue.updated',
  ticketCalled: 'ticket.called',
  ticketCancelled: 'ticket.cancelled',
} as const

export type WsEventName = (typeof WS_EVENTS)[keyof typeof WS_EVENTS]

export const TICKET_STATUSES = ['Waiting', 'Called', 'InService', 'Done', 'Cancelled', 'NoShow'] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]

export const ACTIVE_TICKET_STATUSES: TicketStatus[] = ['Waiting', 'Called', 'InService']

export const QUEUE_STATUSES = ['Open', 'Paused', 'Closed'] as const
export type QueueStatus = (typeof QUEUE_STATUSES)[number]
export const OPEN_QUEUE_STATUS: QueueStatus = 'Open'

export const NOTIFICATION_STAGES = ['Stage1', 'Stage2'] as const
export type NotificationStage = (typeof NOTIFICATION_STAGES)[number]
