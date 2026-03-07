import { IsIn } from 'class-validator'

export const QUEUE_TICKET_STATUSES = ['Waiting', 'Called', 'InService', 'Done', 'Cancelled', 'NoShow'] as const
export type QueueTicketStatus = (typeof QUEUE_TICKET_STATUSES)[number]

export class UpdateTicketStatusDto {
  @IsIn(QUEUE_TICKET_STATUSES)
  status!: QueueTicketStatus
}
