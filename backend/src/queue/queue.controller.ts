import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common'

import { EnrollTicketDto } from './dto/enroll-ticket.dto'
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

  private getUserContext(userId?: string, userName?: string): UserContext {
    return {
      id: userId?.trim() || 'guest-user',
      name: userName?.trim() || 'Guest User',
    }
  }
}
