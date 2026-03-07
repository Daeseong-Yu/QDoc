import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'

import { ACTIVE_TICKET_STATUSES, OPEN_QUEUE_STATUS } from '../common/contracts'
import { CancelTicketDto } from './dto/cancel-ticket.dto'
import { EnrollTicketDto } from './dto/enroll-ticket.dto'
import { QueueGateway } from './queue.gateway'
import type { QueueTicketStatus } from './dto/update-ticket-status.dto'
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto'
import { PrismaService } from '../prisma/prisma.service'

type UserContext = {
  id: string
  name: string
}

type WaitSummary = {
  peopleAhead: number
  avgMin: number
  estimatedWaitMin: number
}

type QueueTicketRecord = Prisma.QueueTicketGetPayload<{
  include: {
    queue: {
      include: {
        hospital: true
      }
    }
    familyMember: true
  }
}>

const ENROLL_MAX_RETRIES = 3
const ENROLL_LOCK_TIMEOUT_MS = 8_000
const ENROLL_LOCK_TIMEOUT_ERROR = 'QUEUE_ENROLL_LOCK_TIMEOUT'
const ENROLL_BUSY_MESSAGE = 'Queue enrollment is busy. Please retry.'

function isActiveStatus(status: string) {
  return ACTIVE_TICKET_STATUSES.some((item) => item === status)
}

function hasPrismaErrorCode(error: unknown, code: string) {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === code,
  )
}

function isRetryableEnrollError(error: unknown) {
  return hasPrismaErrorCode(error, 'P2034') || hasPrismaErrorCode(error, 'P2002')
}

@Injectable()
export class QueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueGateway: QueueGateway,
  ) {}

  async listMyTickets(user: UserContext) {
    const customer = await this.getOrCreateCustomer(user)
    const tickets = await this.prisma.queueTicket.findMany({
      where: {
        customerId: customer.id,
      },
      include: {
        queue: {
          include: {
            hospital: true,
          },
        },
        familyMember: true,
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
    const customer = await this.getOrCreateCustomer(user)
    const queue = await this.selectQueue(input.hospitalId, input.departmentId)

    if (queue.status !== OPEN_QUEUE_STATUS || queue.hospital.queueStatus !== OPEN_QUEUE_STATUS) {
      throw new BadRequestException('Queue is not accepting new registrations')
    }

    const familyMember =
      input.targetType === 'family'
        ? await this.getOrCreateFamilyMember(customer.id, input.familyMemberId, input.targetName)
        : null

    if (input.targetType === 'family' && !input.targetName.trim()) {
      throw new BadRequestException('Family target name is required')
    }

    const ticket = await this.createTicketWithConcurrencyControl(queue.id, customer.id, familyMember?.id ?? null)
    const fullTicket = await this.getTicketRecord(ticket.id)
    const wait = await this.calculateWait(fullTicket)

    await this.recordQueueSnapshot(queue.id)

    return {
      ticket: {
        id: fullTicket.id,
        ticketNumber: fullTicket.ticketNumber,
        familyMemberId: fullTicket.familyMemberId,
        status: fullTicket.status,
        createdAt: fullTicket.createdAt.toISOString(),
        updatedAt: fullTicket.updatedAt.toISOString(),
        cancelledReason: fullTicket.cancelledReason,
      },
      wait,
      notifications: ['Queue registration completed.'],
    }
  }

  async cancel(ticketId: string, user: UserContext, input: CancelTicketDto) {
    const ticket = await this.getTicketRecord(ticketId)
    await this.assertTicketAccess(ticket.customerId, user)

    if (!isActiveStatus(ticket.status)) {
      throw new BadRequestException('Only active tickets can be cancelled')
    }

    const updated = await this.prisma.queueTicket.update({
      where: {
        id: ticketId,
      },
      data: {
        status: 'Cancelled',
        cancelledReason: input.reason?.trim() || 'Cancelled by customer',
      },
      include: {
        queue: {
          include: {
            hospital: true,
          },
        },
        familyMember: true,
      },
    })

    this.queueGateway.emitTicketCancelled({
      ticketId: updated.id,
      queueId: updated.queueId,
      reason: updated.cancelledReason,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
    })
    await this.recordQueueSnapshot(updated.queueId)

    const wait = await this.calculateWait(updated)
    return this.toApiTicket(updated, wait)
  }

  async updateStatus(ticketId: string, input: UpdateTicketStatusDto) {
    await this.getTicketRecord(ticketId)

    const updated = await this.prisma.queueTicket.update({
      where: {
        id: ticketId,
      },
      data: {
        status: input.status,
        cancelledReason: input.status === 'Cancelled' ? 'Cancelled by staff' : null,
        calledAt: input.status === 'Called' ? new Date() : null,
        completedAt: ['Done', 'NoShow'].includes(input.status) ? new Date() : null,
      },
      include: {
        queue: {
          include: {
            hospital: true,
          },
        },
        familyMember: true,
      },
    })

    if (input.status === 'Called') {
      this.queueGateway.emitTicketCalled({
        ticketId: updated.id,
        queueId: updated.queueId,
        status: updated.status,
        calledAt: updated.calledAt?.toISOString() ?? null,
        updatedAt: updated.updatedAt.toISOString(),
      })
    }

    if (input.status === 'Cancelled') {
      this.queueGateway.emitTicketCancelled({
        ticketId: updated.id,
        queueId: updated.queueId,
        reason: updated.cancelledReason,
        status: updated.status,
        updatedAt: updated.updatedAt.toISOString(),
      })
    }

    await this.recordQueueSnapshot(updated.queueId)

    const wait = await this.calculateWait(updated)
    return {
      ticket: this.toApiTicket(updated, wait),
      wait,
    }
  }

  private async getTicketRecord(ticketId: string) {
    const ticket = await this.prisma.queueTicket.findUnique({
      where: {
        id: ticketId,
      },
      include: {
        queue: {
          include: {
            hospital: true,
          },
        },
        familyMember: true,
      },
    })

    if (!ticket) {
      throw new NotFoundException('Ticket not found')
    }

    return ticket
  }

  private async selectQueue(hospitalId: string, departmentId?: string) {
    const hospital = await this.prisma.hospital.findUnique({
      where: {
        id: hospitalId,
      },
    })

    if (!hospital) {
      throw new NotFoundException('Hospital not found')
    }

    const queue = departmentId
      ? await this.prisma.queue.findFirst({
          where: {
            hospitalId,
            departmentId,
          },
          include: {
            hospital: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        })
      : await this.prisma.queue.findFirst({
          where: {
            hospitalId,
          },
          include: {
            hospital: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        })

    if (!queue) {
      throw new NotFoundException('Queue not found for hospital')
    }

    return queue
  }

  private async calculateWait(ticket: {
    queueId: string
    ticketNumber: number
    status: string
  }): Promise<WaitSummary> {
    const queue = await this.prisma.queue.findUnique({
      where: {
        id: ticket.queueId,
      },
      include: {
        hospital: true,
        tickets: {
          where: {
            status: {
              in: [...ACTIVE_TICKET_STATUSES],
            },
          },
          orderBy: {
            ticketNumber: 'asc',
          },
          select: {
            ticketNumber: true,
          },
        },
        waitSnapshots: {
          orderBy: {
            capturedAt: 'desc',
          },
          take: 1,
          select: {
            averageMinutes: true,
          },
        },
      },
    })

    if (!queue) {
      throw new NotFoundException('Queue not found')
    }

    const avgMin = queue.waitSnapshots[0]?.averageMinutes ?? queue.avgMin ?? queue.hospital.avgMin
    if (!isActiveStatus(ticket.status)) {
      return {
        peopleAhead: 0,
        avgMin,
        estimatedWaitMin: 0,
      }
    }

    const peopleAhead = queue.tickets.filter((item) => item.ticketNumber < ticket.ticketNumber).length
    return {
      peopleAhead,
      avgMin,
      estimatedWaitMin: peopleAhead * avgMin,
    }
  }

  private async recordQueueSnapshot(queueId: string) {
    const queue = await this.prisma.queue.findUnique({
      where: {
        id: queueId,
      },
      include: {
        hospital: true,
        tickets: {
          where: {
            status: {
              in: [...ACTIVE_TICKET_STATUSES],
            },
          },
          select: {
            ticketNumber: true,
          },
        },
      },
    })

    if (!queue) {
      return
    }

    const waitingCount = queue.tickets.length
    const avgMin = queue.avgMin ?? queue.hospital.avgMin

    await this.prisma.waitTimeSnapshot.create({
      data: {
        id: this.createId('wait'),
        hospitalId: queue.hospitalId,
        queueId: queue.id,
        source: 'queue-service',
        averageMinutes: avgMin,
        waitingCount,
      },
    })

    this.queueGateway.emitQueueUpdated({
      queueId: queue.id,
      hospitalId: queue.hospitalId,
      waitingCount,
      avgMin,
      estimatedWaitMin: waitingCount * avgMin,
      emittedAt: new Date().toISOString(),
    })
  }

  private toApiTicket(ticket: QueueTicketRecord, wait: WaitSummary) {
    return {
      id: ticket.id,
      queueId: ticket.queueId,
      familyMemberId: ticket.familyMemberId,
      status: ticket.status,
      ticketNumber: ticket.ticketNumber,
      cancelledReason: ticket.cancelledReason,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
      queue: {
        id: ticket.queueId,
        avgMin: wait.avgMin,
        hospital: {
          id: ticket.queue.hospital.id,
          name: ticket.queue.hospital.name,
        },
      },
      familyMember: ticket.familyMemberId
        ? {
            id: ticket.familyMemberId,
            name: ticket.familyMember?.name ?? 'Family Member',
          }
        : null,
      wait,
    }
  }

  private async getOrCreateCustomer(user: UserContext) {
    const existing = await this.prisma.customer.findUnique({
      where: {
        id: user.id,
      },
    })

    if (existing) {
      if (existing.name !== user.name || existing.authUserId !== user.id) {
        return this.prisma.customer.update({
          where: {
            id: user.id,
          },
          data: {
            name: user.name,
            authUserId: user.id,
          },
        })
      }

      return existing
    }

    return this.prisma.customer.create({
      data: {
        id: user.id,
        authUserId: user.id,
        name: user.name,
      },
    })
  }

  private async getOrCreateFamilyMember(customerId: string, familyMemberId: string | undefined, name: string) {
    if (familyMemberId) {
      const existing = await this.prisma.familyMember.findUnique({
        where: {
          id: familyMemberId,
        },
      })

      if (existing) {
        if (existing.customerId !== customerId) {
          throw new ConflictException('Family member does not belong to current user')
        }

        if (existing.name !== name) {
          return this.prisma.familyMember.update({
            where: {
              id: familyMemberId,
            },
            data: {
              name,
            },
          })
        }

        return existing
      }
    }

    return this.prisma.familyMember.create({
      data: {
        id: familyMemberId ?? this.createId('family'),
        customerId,
        name,
        relationship: 'Family',
      },
    })
  }

  private async assertTicketAccess(customerId: string, user: UserContext) {
    const customer = await this.getOrCreateCustomer(user)
    if (customer.id !== customerId) {
      throw new ForbiddenException('Ticket does not belong to current user')
    }
  }

  private async createTicketWithConcurrencyControl(
    queueId: string,
    customerId: string,
    familyMemberId: string | null,
  ) {
    for (let attempt = 1; attempt <= ENROLL_MAX_RETRIES; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const lockRows = await tx.$queryRaw<Array<{ lockResult: number }>>`
              DECLARE @lockResult INT;
              EXEC @lockResult = sp_getapplock
                @Resource = ${`queue-enroll:${queueId}`},
                @LockMode = 'Exclusive',
                @LockOwner = 'Transaction',
                @LockTimeout = ${ENROLL_LOCK_TIMEOUT_MS};
              SELECT @lockResult AS lockResult;
            `

            const lockResult = lockRows[0]?.lockResult ?? -999
            if (lockResult < 0) {
              throw new Error(ENROLL_LOCK_TIMEOUT_ERROR)
            }

            const duplicate = await tx.queueTicket.findFirst({
              where: {
                customerId,
                familyMemberId,
                status: {
                  in: [...ACTIVE_TICKET_STATUSES],
                },
              },
            })

            if (duplicate) {
              throw new ConflictException('You already have an active queue ticket for this target')
            }

            const latestTicket = await tx.queueTicket.findFirst({
              where: {
                queueId,
              },
              orderBy: {
                ticketNumber: 'desc',
              },
              select: {
                ticketNumber: true,
              },
            })

            return tx.queueTicket.create({
              data: {
                id: this.createId('ticket'),
                queueId,
                customerId,
                familyMemberId,
                status: 'Waiting',
                ticketNumber: (latestTicket?.ticketNumber ?? 100) + 1,
              },
            })
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        )
      } catch (error) {
        if (error instanceof ConflictException) {
          throw error
        }

        if (error instanceof Error && error.message === ENROLL_LOCK_TIMEOUT_ERROR) {
          if (attempt < ENROLL_MAX_RETRIES) {
            continue
          }

          throw new ConflictException(ENROLL_BUSY_MESSAGE)
        }

        if (isRetryableEnrollError(error)) {
          if (attempt < ENROLL_MAX_RETRIES) {
            continue
          }

          throw new ConflictException(ENROLL_BUSY_MESSAGE)
        }

        throw error
      }
    }

    throw new ConflictException(ENROLL_BUSY_MESSAGE)
  }

  private createId(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.round(Math.random() * 1000)}`
  }
}

