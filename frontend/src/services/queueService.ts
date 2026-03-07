import type { QueueTicket } from '../types/queue'

export function subscribeQueueTicketChanges(_handler: () => void) {
  return () => undefined
}

export async function getLatestActiveTicket(): Promise<QueueTicket | null> {
  return null
}
