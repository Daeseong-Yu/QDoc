import { Injectable, Logger } from '@nestjs/common'
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets'
import { Server } from 'socket.io'

import { WS_EVENTS } from '../common/contracts'

@WebSocketGateway({
  namespace: '/queue',
})
@Injectable()
export class QueueGateway {
  private readonly logger = new Logger(QueueGateway.name)

  @WebSocketServer()
  server!: Server

  emitQueueUpdated(payload: Record<string, unknown>) {
    this.server.emit(WS_EVENTS.queueUpdated, payload)
    this.logger.debug(`${WS_EVENTS.queueUpdated}: ${JSON.stringify(payload)}`)
  }

  emitTicketCalled(payload: Record<string, unknown>) {
    this.server.emit(WS_EVENTS.ticketCalled, payload)
    this.logger.debug(`${WS_EVENTS.ticketCalled}: ${JSON.stringify(payload)}`)
  }

  emitTicketCancelled(payload: Record<string, unknown>) {
    this.server.emit(WS_EVENTS.ticketCancelled, payload)
    this.logger.debug(`${WS_EVENTS.ticketCancelled}: ${JSON.stringify(payload)}`)
  }
}

