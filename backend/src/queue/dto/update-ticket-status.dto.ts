import { IsIn } from 'class-validator'

import { TICKET_STATUSES, TicketStatus } from '../../common/contracts'

export class UpdateTicketStatusDto {
  @IsIn(TICKET_STATUSES)
  status!: TicketStatus
}
