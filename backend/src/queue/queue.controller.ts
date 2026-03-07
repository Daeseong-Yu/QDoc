import { Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common'

import { CancelTicketDto } from './dto/cancel-ticket.dto'
import { EnrollTicketDto } from './dto/enroll-ticket.dto'
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto'
import { QueueService } from './queue.service'

type UserContext = {
  id: string
  name: string
}

@Controller('queues')
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Get('my/tickets')
  listMyTickets(
    @Headers('x-user-id') userId?: string,
    @Headers('x-user-name') userName?: string,
  ) {
    return this.queueService.listMyTickets(this.getUserContext(userId, userName))
  }

  @Get('tickets/:ticketId')
  getTicket(@Param('ticketId') ticketId: string) {
    return this.queueService.getTicket(ticketId)
  }

  @Post('tickets/enroll')
  enroll(
    @Headers('x-user-id') userId: string | undefined,
    @Headers('x-user-name') userName: string | undefined,
    @Body() body: EnrollTicketDto,
  ) {
    return this.queueService.enroll(this.getUserContext(userId, userName), body)
  }

  @Post('tickets/:ticketId/cancel')
  cancel(
    @Param('ticketId') ticketId: string,
    @Headers('x-user-id') userId: string | undefined,
    @Headers('x-user-name') userName: string | undefined,
    @Body() body: CancelTicketDto,
  ) {
    return this.queueService.cancel(ticketId, this.getUserContext(userId, userName), body)
  }

  @Patch('tickets/:ticketId/status')
  updateStatus(@Param('ticketId') ticketId: string, @Body() body: UpdateTicketStatusDto) {
    return this.queueService.updateStatus(ticketId, body)
  }

  private getUserContext(userId?: string, userName?: string): UserContext {
    return {
      id: userId?.trim() || 'guest-user',
      name: userName?.trim() || 'Guest User',
    }
  }
}
