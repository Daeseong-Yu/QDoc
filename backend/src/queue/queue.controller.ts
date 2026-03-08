import { Body, Controller, Get, Inject, Param, Patch, Post, Req } from '@nestjs/common'

import type { AuthenticatedRequest } from '../auth/authenticated-request'
import { Roles } from '../auth/roles.decorator'
import { CancelTicketDto } from './dto/cancel-ticket.dto'
import { EnrollTicketDto } from './dto/enroll-ticket.dto'
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto'
import { QueueService } from './queue.service'

@Controller('queues')
export class QueueController {
  constructor(@Inject(QueueService) private readonly queueService: QueueService) {}

  @Get('my/tickets')
  @Roles('patient', 'staff', 'admin')
  listMyTickets(@Req() request: AuthenticatedRequest) {
    return this.queueService.listMyTickets(request.user!)
  }

  @Get('tickets/:ticketId')
  @Roles('patient', 'staff', 'admin', 'robot')
  getTicket(@Param('ticketId') ticketId: string, @Req() request: AuthenticatedRequest) {
    return this.queueService.getTicket(ticketId, request.user)
  }

  @Post('tickets/enroll')
  @Roles('patient', 'staff', 'admin')
  enroll(@Req() request: AuthenticatedRequest, @Body() body: EnrollTicketDto) {
    return this.queueService.enroll(request.user!, body)
  }

  @Post('tickets/:ticketId/cancel')
  @Roles('patient', 'staff', 'admin')
  cancel(
    @Param('ticketId') ticketId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: CancelTicketDto,
  ) {
    return this.queueService.cancel(ticketId, request.user!, body)
  }

  @Patch('tickets/:ticketId/status')
  @Roles('staff', 'admin')
  updateStatus(
    @Param('ticketId') ticketId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: UpdateTicketStatusDto,
  ) {
    return this.queueService.updateStatus(ticketId, request.user!, body)
  }
}


