import { io, Socket } from 'socket.io-client'

import { WS_BASE_URL } from '../app/env'
import { getQueueTicketById } from './queueService'
import type { QueueTicket, QueueTicketStatus } from '../types/queue'

const POLLING_BASE_INTERVAL_MS = 12_000
const POLLING_MAX_INTERVAL_MS = 45_000
const POLLING_BACKOFF_FACTOR = 1.8
const POLLING_JITTER_RATIO = 0.2
const POLLING_MAX_FAILURE_STEPS = 6

type ConnectionMode = 'websocket' | 'polling'

type ConnectionMeta = {
  mode: ConnectionMode
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

type TicketEventPayload = {
  ticketId?: string
}

function isTerminalStatus(status: QueueTicketStatus) {
  return status === 'Cancelled' || status === 'Done' || status === 'NoShow'
}

function calculatePollingDelay(failureCount: number) {
  const boundedFailures = Math.min(failureCount, POLLING_MAX_FAILURE_STEPS)
  const baseDelay = Math.min(
    POLLING_MAX_INTERVAL_MS,
    Math.round(POLLING_BASE_INTERVAL_MS * Math.pow(POLLING_BACKOFF_FACTOR, boundedFailures)),
  )

  const jitter = Math.round(baseDelay * POLLING_JITTER_RATIO * Math.random())
  return baseDelay + jitter
}

export function subscribeQueueRealtime(
  ticketId: string,
  handlers: RealtimeHandlers,
): QueueRealtimeController {
  let stopped = false
  let socket: Socket | null = null
  let pollTimer: number | null = null
  let pollingEnabled = false
  let pollingFailures = 0

  let mode: ConnectionMode = 'websocket'
  let unstable = false

  function emitConnection(nextMode: ConnectionMode, nextUnstable: boolean) {
    mode = nextMode
    unstable = nextUnstable
    handlers.onConnectionChange({ mode, unstable })
  }

  function clearPollingTimer() {
    if (pollTimer !== null) {
      window.clearTimeout(pollTimer)
      pollTimer = null
    }
  }

  function stopPolling() {
    pollingEnabled = false
    clearPollingTimer()
  }

  function schedulePolling(delayMs: number, pollFn: () => Promise<void>) {
    if (stopped || !pollingEnabled) {
      return
    }

    clearPollingTimer()
    pollTimer = window.setTimeout(() => {
      void pollFn()
    }, delayMs)
  }

  async function refreshTicket() {
    if (stopped) {
      return
    }

    const latest = await getQueueTicketById(ticketId)
    if (!latest) {
      return
    }

    handlers.onTicketUpdate(latest, { mode, unstable })

    if (isTerminalStatus(latest.status)) {
      stopPolling()
      socket?.disconnect()
      socket = null
    }
  }

  function triggerRefresh() {
    void refreshTicket().catch(() => undefined)
  }

  async function pollOnce() {
    if (stopped || !pollingEnabled) {
      return
    }

    try {
      await refreshTicket()
      pollingFailures = 0
    } catch {
      pollingFailures = Math.min(pollingFailures + 1, POLLING_MAX_FAILURE_STEPS)
    } finally {
      const nextDelay = calculatePollingDelay(pollingFailures)
      schedulePolling(nextDelay, pollOnce)
    }
  }

  function startPolling() {
    if (stopped || pollingEnabled) {
      return
    }

    pollingEnabled = true
    pollingFailures = 0
    emitConnection('polling', true)
    schedulePolling(0, pollOnce)
  }

  function connectWebsocket() {
    socket?.disconnect()
    socket = null

    const instance = io(`${WS_BASE_URL}/queue`, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 2000,
    })

    instance.on('connect', () => {
      if (stopped) {
        return
      }

      stopPolling()
      emitConnection('websocket', false)
      triggerRefresh()
    })

    instance.on('connect_error', () => {
      startPolling()
    })

    instance.on('disconnect', () => {
      startPolling()
    })

    instance.on('queue.updated', () => {
      triggerRefresh()
    })

    instance.on('ticket.called', (payload: TicketEventPayload) => {
      if (payload.ticketId && payload.ticketId !== ticketId) {
        return
      }

      triggerRefresh()
    })

    instance.on('ticket.cancelled', (payload: TicketEventPayload) => {
      if (payload.ticketId && payload.ticketId !== ticketId) {
        return
      }

      triggerRefresh()
    })

    socket = instance
  }

  connectWebsocket()
  triggerRefresh()

  return {
    unsubscribe: () => {
      stopped = true
      stopPolling()
      socket?.disconnect()
      socket = null
    },
    retryWebsocket: () => {
      if (stopped) {
        return
      }

      stopPolling()
      emitConnection('websocket', false)
      connectWebsocket()
      triggerRefresh()
    },
  }
}
