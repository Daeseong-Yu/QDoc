import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'

import { ACTIVE_TICKET_STATUSES, OPEN_QUEUE_STATUS } from '../common/contracts'
import { PrismaService } from '../prisma/prisma.service'
import { CancelTicketDto } from './dto/cancel-ticket.dto'
import { EnrollTicketDto } from './dto/enroll-ticket.dto'
import { QueueGateway } from './queue.gateway'
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto'

type UserContext = {
  id: string
  name: string
}

type WaitSummary = {
  peopleAhead: number
  avgMin: number
  estimatedWaitMin: number
}

type PatientQueueRecord = Prisma.PatientQueueGetPayload<{
  include: {
    clinic: true
  }
}>

const WAITING_DB_STATUS = 'Waiting'
const INSIDE_DB_STATUS = 'Inside'
const COMPLETED_DB_STATUS = 'Completed'
const CANCELED_DB_STATUS = 'Canceled'

function isRetryableEnrollError(error: unknown) {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      ['P2034', 'P2002'].includes(String((error as { code?: unknown }).code)),
  )
}

function toDbStatus(status: string) {
  switch (status) {
    case 'Called':
    case 'InService':
      return INSIDE_DB_STATUS
    case 'Done':
    case 'NoShow':
      return COMPLETED_DB_STATUS
    case 'Cancelled':
      return CANCELED_DB_STATUS
    default:
      return WAITING_DB_STATUS
  }
}

function toApiStatus(status: string) {
  switch (status) {
    case INSIDE_DB_STATUS:
      return 'InService'
    case COMPLETED_DB_STATUS:
      return 'Done'
    case CANCELED_DB_STATUS:
      return 'Cancelled'
    default:
      return 'Waiting'
  }
}

function isActiveDbStatus(status: string | null | undefined) {
  return status === WAITING_DB_STATUS || status === INSIDE_DB_STATUS
}

@Injectable()
export class QueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueGateway: QueueGateway,
  ) {}

  async listMyTickets(user: UserContext) {
    const tickets = await this.prisma.patientQueue.findMany({
      where: {
        patientName: user.name,
      },
      include: {
        clinic: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return Promise.all(
      tickets.map(async (ticket) => {
        const wait = await this.calculateWait(ticket)
        return this.toApiTicket(ticket, wait)
      }),
    )
  }

  async getTicket(ticketId: string) {
    const ticket = await this.getTicketRecord(ticketId)
    const wait = await this.calculateWait(ticket)
    return this.toApiTicket(ticket, wait)
  }

  async enroll(user: UserContext, input: EnrollTicketDto) {
    if (input.targetType !== 'self') {
      throw new BadRequestException('Current queue storage supports self target only')
    }

    const clinic = await this.getClinic(input.hospitalId)
    if (!clinic) {
      throw new NotFoundException('Hospital not found')
    }

    if (OPEN_QUEUE_STATUS !== 'Open') {
      throw new BadRequestException('Queue is not accepting new registrations')
    }

    const duplicate = await this.prisma.patientQueue.findFirst({
      where: {
        patientName: user.name,
        status: {
          in: [WAITING_DB_STATUS, INSIDE_DB_STATUS],
        },
      },
      include: {
        clinic: true,
      },
    })

    if (duplicate) {
      throw new ConflictException('You already have an active queue ticket for this target')
    }

    let created: PatientQueueRecord | null = null

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await this.prisma.$transaction(
          async (tx) => {
            await tx.$executeRaw`
              EXEC dbo.usp_JoinQueue @ClinicID = ${clinic.clinicId}, @PatientName = ${user.name}
            `
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        )

        created = await this.prisma.patientQueue.findFirst({
          where: {
            clinicId: clinic.clinicId,
            patientName: user.name,
            status: WAITING_DB_STATUS,
          },
          include: {
            clinic: true,
          },
          orderBy: {
            queueId: 'desc',
          },
        })

        if (created) {
          break
        }
      } catch (error) {
        if (error instanceof ConflictException) {
          throw error
        }

        if (!isRetryableEnrollError(error) || attempt === 3) {
          throw error
        }
      }
    }

    if (!created) {
      throw new ConflictException('Queue enrollment could not be completed')
    }

    await this.syncClinicWaitCount(created.clinicId)
    await this.generateRank3Alert(created.clinicId)

    const wait = await this.calculateWait(created)
    this.queueGateway.emitQueueUpdated(await this.createQueueSummary(created.clinicId))

    return {
      ticket: {
        id: String(created.queueId),
        ticketNumber: created.queueId,
        familyMemberId: null,
        status: toApiStatus(created.status ?? WAITING_DB_STATUS),
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.createdAt.toISOString(),
        cancelledReason: null,
      },
      wait,
      notifications: ['Queue registration completed.'],
    }
  }

  async cancel(ticketId: string, user: UserContext, input: CancelTicketDto) {
    const ticket = await this.getTicketRecord(ticketId)
    this.assertTicketAccess(ticket, user)

    if (!isActiveDbStatus(ticket.status)) {
      throw new BadRequestException('Only active tickets can be cancelled')
    }

    const updated = await this.prisma.patientQueue.update({
      where: {
        queueId: ticket.queueId,
      },
      data: {
        status: CANCELED_DB_STATUS,
      },
      include: {
        clinic: true,
      },
    })

    await this.syncClinicWaitCount(updated.clinicId)
    await this.generateRank3Alert(updated.clinicId)

    this.queueGateway.emitTicketCancelled({
      ticketId: String(updated.queueId),
      queueId: this.getQueueChannelId(updated.clinicId),
      reason: input.reason?.trim() || 'Cancelled by customer',
      status: toApiStatus(updated.status ?? CANCELED_DB_STATUS),
      updatedAt: new Date().toISOString(),
    })
    this.queueGateway.emitQueueUpdated(await this.createQueueSummary(updated.clinicId))

    const wait = await this.calculateWait(updated)
    return this.toApiTicket(updated, wait, input.reason?.trim() || 'Cancelled by customer')
  }

  async updateStatus(ticketId: string, input: UpdateTicketStatusDto) {
    const ticket = await this.getTicketRecord(ticketId)
    const nextStatus = toDbStatus(input.status)

    const updated = await this.prisma.patientQueue.update({
      where: {
        queueId: ticket.queueId,
      },
      data: {
        status: nextStatus,
      },
      include: {
        clinic: true,
      },
    })

    await this.syncClinicWaitCount(updated.clinicId)
    await this.generateRank3Alert(updated.clinicId)

    if (input.status === 'Called' || input.status === 'InService') {
      this.queueGateway.emitTicketCalled({
        ticketId: String(updated.queueId),
        queueId: this.getQueueChannelId(updated.clinicId),
        status: toApiStatus(updated.status ?? INSIDE_DB_STATUS),
        updatedAt: new Date().toISOString(),
      })
    }

    if (input.status === 'Cancelled') {
      this.queueGateway.emitTicketCancelled({
        ticketId: String(updated.queueId),
        queueId: this.getQueueChannelId(updated.clinicId),
        reason: 'Cancelled by staff',
        status: toApiStatus(updated.status ?? CANCELED_DB_STATUS),
        updatedAt: new Date().toISOString(),
      })
    }

    this.queueGateway.emitQueueUpdated(await this.createQueueSummary(updated.clinicId))

    const wait = await this.calculateWait(updated)
    return {
      ticket: this.toApiTicket(updated, wait, input.status === 'Cancelled' ? 'Cancelled by staff' : null),
      wait,
    }
  }

  private async getClinic(hospitalId: string) {
    const clinicId = this.parseClinicId(hospitalId)
    return this.prisma.clinic.findUnique({
      where: {
        clinicId,
      },
    })
  }

  private async getTicketRecord(ticketId: string) {
    const queueId = this.parseQueueId(ticketId)
    const ticket = await this.prisma.patientQueue.findUnique({
      where: {
        queueId,
      },
      include: {
        clinic: true,
      },
    })

    if (!ticket) {
      throw new NotFoundException('Ticket not found')
    }

    return ticket
  }

  private async calculateWait(ticket: {
    queueId: number
    clinicId: number
    status: string | null
  }): Promise<WaitSummary> {
    const clinic = await this.prisma.clinic.findUnique({
      where: {
        clinicId: ticket.clinicId,
      },
      include: {
        patientQueues: {
          where: {
            status: WAITING_DB_STATUS,
          },
          orderBy: [
            { createdAt: 'asc' },
            { queueId: 'asc' },
          ],
          select: {
            queueId: true,
          },
        },
      },
    })

    if (!clinic) {
      throw new NotFoundException('Queue not found')
    }

    const avgMin = clinic.avgConsultTimeMinutes
    if (ticket.status !== WAITING_DB_STATUS) {
      return {
        peopleAhead: 0,
        avgMin,
        estimatedWaitMin: 0,
      }
    }

    const peopleAhead = clinic.patientQueues.filter((item) => item.queueId < ticket.queueId).length
    return {
      peopleAhead,
      avgMin,
      estimatedWaitMin: peopleAhead * avgMin,
    }
  }

  private toApiTicket(ticket: PatientQueueRecord, wait: WaitSummary, cancelledReason: string | null = null) {
    return {
      id: String(ticket.queueId),
      queueId: this.getQueueChannelId(ticket.clinicId),
      familyMemberId: null,
      status: toApiStatus(ticket.status ?? WAITING_DB_STATUS),
      ticketNumber: ticket.queueId,
      cancelledReason,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.createdAt.toISOString(),
      queue: {
        id: this.getQueueChannelId(ticket.clinicId),
        avgMin: wait.avgMin,
        hospital: {
          id: String(ticket.clinicId),
          name: ticket.clinic.name ?? `Clinic ${ticket.clinicId}`,
        },
      },
      familyMember: null,
      wait,
    }
  }

  private assertTicketAccess(ticket: PatientQueueRecord, user: UserContext) {
    if ((ticket.patientName ?? '') !== user.name) {
      throw new ForbiddenException('Ticket does not belong to current user')
    }
  }

  private async syncClinicWaitCount(clinicId: number) {
    const waitingCount = await this.prisma.patientQueue.count({
      where: {
        clinicId,
        status: WAITING_DB_STATUS,
      },
    })

    await this.prisma.clinic.update({
      where: {
        clinicId,
      },
      data: {
        totalWaitCount: waitingCount,
      },
    })
  }

  private async generateRank3Alert(clinicId: number) {
    await this.prisma.$executeRaw`
      EXEC dbo.usp_SendRank3Alert @ClinicID = ${clinicId}
    `
  }

  private async createQueueSummary(clinicId: number) {
    const clinic = await this.prisma.clinic.findUnique({
      where: {
        clinicId,
      },
    })

    if (!clinic) {
      throw new NotFoundException('Hospital not found')
    }

    const waitingCount = await this.prisma.patientQueue.count({
      where: {
        clinicId,
        status: WAITING_DB_STATUS,
      },
    })

    return {
      queueId: this.getQueueChannelId(clinicId),
      hospitalId: String(clinicId),
      waitingCount,
      avgMin: clinic.avgConsultTimeMinutes,
      estimatedWaitMin: waitingCount * clinic.avgConsultTimeMinutes,
      emittedAt: new Date().toISOString(),
    }
  }

  private getQueueChannelId(clinicId: number) {
    return `clinic-${clinicId}`
  }

  private parseClinicId(hospitalId: string) {
    const clinicId = Number(hospitalId)
    if (!Number.isInteger(clinicId) || clinicId <= 0) {
      throw new NotFoundException('Hospital not found')
    }

    return clinicId
  }

  private parseQueueId(ticketId: string) {
    const queueId = Number(ticketId)
    if (!Number.isInteger(queueId) || queueId <= 0) {
      throw new NotFoundException('Ticket not found')
    }

    return queueId
  }
}
