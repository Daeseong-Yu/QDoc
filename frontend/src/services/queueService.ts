import type { QueueTicket } from '../types/queue'

const QUEUE_TICKET_CHANGED_EVENT = 'qdoc:queue-ticket-changed'

export function subscribeQueueTicketChanges(handler: () => void) {
  if (typeof window === 'undefined') {
    return () => undefined
  }

  window.addEventListener(QUEUE_TICKET_CHANGED_EVENT, handler)
  return () => window.removeEventListener(QUEUE_TICKET_CHANGED_EVENT, handler)
}

export async function getLatestActiveTicket(): Promise<QueueTicket | null> {
  return null
}
