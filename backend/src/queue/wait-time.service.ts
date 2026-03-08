import { Inject, Injectable } from '@nestjs/common'

import { ACTIVE_TICKET_STATUSES } from '../common/contracts'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class WaitTimeService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async calculateTicketWait(ticketId: string) {
    const ticket = await this.prisma.queueTicket.findUnique({
      where: { id: ticketId },
      include: {
        queue: true,
      },
    })

    if (!ticket) {
      return null
    }

    const activeTickets = await this.prisma.queueTicket.findMany({
      where: {
        queueId: ticket.queueId,
        status: {
          in: ACTIVE_TICKET_STATUSES,
        },
      },
      orderBy: [
        {
          createdAt: 'asc',
        },
        {
          ticketNumber: 'asc',
        },
      ],
      select: {
        id: true,
      },
    })

    const idx = activeTickets.findIndex((item) => item.id === ticket.id)
    const peopleAhead = idx < 0 ? 0 : idx

    const avgMin = ticket.queue.avgMin > 0 ? ticket.queue.avgMin : 5

    return {
      peopleAhead,
      avgMin,
      estimatedWaitMin: peopleAhead * avgMin,
    }
  }

  async calculateQueueSummary(queueId: string) {
    const queue = await this.prisma.queue.findUnique({
      where: { id: queueId },
      include: {
        tickets: {
          where: {
            status: {
              in: ACTIVE_TICKET_STATUSES,
            },
          },
          select: {
            id: true,
          },
        },
      },
    })

    if (!queue) {
      return null
    }

    const waitingCount = queue.tickets.length
    const avgMin = queue.avgMin > 0 ? queue.avgMin : 5

    return {
      queueId: queue.id,
      hospitalId: queue.hospitalId,
      waitingCount,
      avgMin,
      estimatedWaitMin: waitingCount * avgMin,
    }
  }
}

