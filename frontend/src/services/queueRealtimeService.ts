import { getQueueTicketById, subscribeQueueTicketChanges } from './queueService'
import type { QueueTicket } from '../types/queue'

type ConnectionMeta = {
  mode: 'polling'
  unstable: boolean
}

type RealtimeHandlers = {
  onTicketUpdate: (ticket: QueueTicket, meta: ConnectionMeta) => void
  onConnectionChange: (meta: ConnectionMeta) => void
}

export type QueueRealtimeController = {
  unsubscribe: () => void
  retryWebsocket: () => void
}

export function subscribeQueueRealtime(
  ticketId: string,
  handlers: RealtimeHandlers,
): QueueRealtimeController {
  let stopped = false

  handlers.onConnectionChange({ mode: 'polling', unstable: false })

  async function refreshTicket() {
    if (stopped) {
      return
    }

    const ticket = await getQueueTicketById(ticketId)
    if (!ticket) {
      return
    }

    handlers.onTicketUpdate(ticket, { mode: 'polling', unstable: false })
  }

  const unsubscribeChange = subscribeQueueTicketChanges(() => {
    void refreshTicket()
  })

  const timer = window.setInterval(() => {
    void refreshTicket()
  }, 15000)

  void refreshTicket()

  return {
    unsubscribe: () => {
      stopped = true
      window.clearInterval(timer)
      unsubscribeChange()
    },
    retryWebsocket: () => {
      void refreshTicket()
    },
  }
}
