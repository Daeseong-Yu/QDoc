import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'

import { AuthenticatedUser } from '../auth/auth.types'
import { ACTIVE_TICKET_STATUSES, OPEN_QUEUE_STATUS } from '../common/contracts'
import { PrismaService } from '../prisma/prisma.service'
import { CancelTicketDto } from './dto/cancel-ticket.dto'
import { EnrollTicketDto } from './dto/enroll-ticket.dto'
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto'
import { NotificationService } from './notification.service'
import { QueueGateway } from './queue.gateway'
import { WaitTimeService } from './wait-time.service'

const ENROLL_MAX_RETRIES = 3
const ENROLL_LOCK_TIMEOUT_MS = 8_000
const ENROLL_LOCK_TIMEOUT_ERROR = 'QUEUE_ENROLL_LOCK_TIMEOUT'
const ENROLL_BUSY_MESSAGE = 'Queue enrollment is busy. Please retry.'

function hasPrismaErrorCode(error: unknown, code: string) {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === code,
  )
}

function isRetryableEnrollError(error: unknown) {
  if (hasPrismaErrorCode(error, 'P2034')) {
    return true
  }

  if (hasPrismaErrorCode(error, 'P2002')) {
    return true
  }

  return error instanceof Error && error.message === ENROLL_LOCK_TIMEOUT_ERROR
}

@Injectable()
export class QueueService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WaitTimeService) private readonly waitTimeService: WaitTimeService,
    @Inject(NotificationService) private readonly notificationService: NotificationService,
    @Inject(QueueGateway) private readonly queueGateway: QueueGateway,
  ) {}

  async enroll(user: AuthenticatedUser, input: EnrollTicketDto) {
    if (input.targetType !== 'self') {
      throw new BadRequestException('MVP supports self target only')
    }

    const customer = await this.getOrCreateCustomer(user)
    const queue = await this.selectQueue(input.hospitalId, input.departmentId)

    if (queue.status !== OPEN_QUEUE_STATUS) {
      throw new BadRequestException('Queue is not accepting new registrations')
    }

    const ticket = await this.createTicketWithConcurrencyControl(queue.id, customer.id)

    const wait = await this.waitTimeService.calculateTicketWait(ticket.id)
    if (!wait) {
      throw new NotFoundException('Unable to calculate wait time')
    }

    const notifications = await this.notificationService.evaluateStages(
      ticket.id,
      wait.peopleAhead,
      wait.estimatedWaitMin,
    )

    await this.broadcastQueueSummary(queue.id)

    return {
      ticket,
      wait,
      notifications,
    }
  }

  async listMyTickets(user: AuthenticatedUser) {
    const customer = await this.getOrCreateCustomer(user)

    const tickets = await this.prisma.queueTicket.findMany({
      where: {
        customerId: customer.id,
      },
      include: {
        queue: {
          include: {
            hospital: {
              select: {
                id: true,
                name: true,
                address: true,
                queueStatus: true,
              },
            },
            department: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        familyMember: {
          select: {
            id: true,
            name: true,
            relationship: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    const withWait = await Promise.all(
      tickets.map(async (ticket) => {
        const wait = await this.waitTimeService.calculateTicketWait(ticket.id)

        return {
          ...ticket,
          wait,
        }
      }),
    )

    return withWait
  }

  async getTicket(ticketId: string, user?: AuthenticatedUser) {
    const ticket = await this.prisma.queueTicket.findUnique({
      where: { id: ticketId },
      include: {
        queue: {
          include: {
            hospital: true,
            department: true,
          },
        },
        customer: true,
        familyMember: true,
      },
    })

    if (!ticket) {
      throw new NotFoundException('Ticket not found')
    }

    if (user) {
      await this.assertTicketAccess(ticket.id, user)
    }

    const wait = await this.waitTimeService.calculateTicketWait(ticket.id)

    return {
      ...ticket,
      wait,
    }
  }

  async cancel(ticketId: string, user: AuthenticatedUser, input: CancelTicketDto) {
    await this.assertTicketAccess(ticketId, user)

    const ticket = await this.prisma.queueTicket.findUnique({
      where: { id: ticketId },
    })

    if (!ticket) {
      throw new NotFoundException('Ticket not found')
    }

    if (!ACTIVE_TICKET_STATUSES.includes(ticket.status as (typeof ACTIVE_TICKET_STATUSES)[number])) {
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
    })

    this.queueGateway.emitTicketCancelled({
      ticketId: updated.id,
      queueId: updated.queueId,
      reason: updated.cancelledReason,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
    })

    await this.broadcastQueueSummary(updated.queueId)

    return updated
  }

  async updateStatus(ticketId: string, _user: AuthenticatedUser, input: UpdateTicketStatusDto) {
    const ticket = await this.prisma.queueTicket.findUnique({
      where: { id: ticketId },
    })

    if (!ticket) {
      throw new NotFoundException('Ticket not found')
    }

    const updated = await this.prisma.queueTicket.update({
      where: {
        id: ticketId,
      },
      data: {
        status: input.status,
        calledAt: input.status === 'Called' ? new Date() : ticket.calledAt,
        completedAt: ['Done', 'NoShow'].includes(input.status) ? new Date() : ticket.completedAt,
      },
    })

    if (input.status === 'Called') {
      this.queueGateway.emitTicketCalled({
        ticketId: updated.id,
        queueId: updated.queueId,
        status: updated.status,
        calledAt: updated.calledAt?.toISOString() ?? null,
      })
    }

    const wait = await this.waitTimeService.calculateTicketWait(ticketId)
    if (wait) {
      await this.notificationService.evaluateStages(ticketId, wait.peopleAhead, wait.estimatedWaitMin)
    }

    await this.broadcastQueueSummary(updated.queueId)

    return {
      ticket: updated,
      wait,
    }
  }

  private async selectQueue(hospitalId: string, departmentId?: string) {
    const hospital = await this.prisma.hospital.findUnique({
      where: { id: hospitalId },
    })

    if (!hospital) {
      throw new NotFoundException('Hospital not found')
    }

    if (hospital.queueStatus !== OPEN_QUEUE_STATUS) {
      throw new BadRequestException('Hospital queue is currently unavailable')
    }

    if (departmentId) {
      const byDepartment = await this.prisma.queue.findFirst({
        where: {
          hospitalId,
          departmentId,
        },
        orderBy: {
          createdAt: 'asc',
        },
      })

      if (!byDepartment) {
        throw new NotFoundException('Queue for department not found')
      }

      return byDepartment
    }

    const queue = await this.prisma.queue.findFirst({
      where: {
        hospitalId,
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

  private async createTicketWithConcurrencyControl(queueId: string, customerId: string) {
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
                queueId,
                status: {
                  in: ACTIVE_TICKET_STATUSES,
                },
                customerId,
                familyMemberId: null,
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

            const nextTicketNumber = (latestTicket?.ticketNumber ?? 100) + 1

            return tx.queueTicket.create({
              data: {
                queueId,
                customerId,
                familyMemberId: null,
                status: 'Waiting',
                ticketNumber: nextTicketNumber,
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

  private async getOrCreateCustomer(user: AuthenticatedUser) {
    const existing = await this.prisma.customer.findFirst({
      where: {
        OR: [{ authUserId: user.authUserId }, { id: user.id }],
      },
    })

    if (existing) {
      return existing
    }

    return this.prisma.customer.create({
      data: {
        id: user.id,
        authUserId: user.authUserId,
        name: user.name,
      },
    })
  }

  private async assertTicketAccess(ticketId: string, user: AuthenticatedUser) {
    if (user.roles.includes('admin') || user.roles.includes('staff')) {
      return
    }

    const customer = await this.getOrCreateCustomer(user)

    const ticket = await this.prisma.queueTicket.findUnique({
      where: { id: ticketId },
      select: {
        customerId: true,
      },
    })

    if (!ticket) {
      throw new NotFoundException('Ticket not found')
    }

    if (ticket.customerId !== customer.id) {
      throw new ForbiddenException('Ticket does not belong to current user')
    }
  }

  private async broadcastQueueSummary(queueId: string) {
    const summary = await this.waitTimeService.calculateQueueSummary(queueId)

    if (!summary) {
      return
    }

    this.queueGateway.emitQueueUpdated({
      queueId: summary.queueId,
      hospitalId: summary.hospitalId,
      waitingCount: summary.waitingCount,
      avgMin: summary.avgMin,
      estimatedWaitMin: summary.estimatedWaitMin,
      emittedAt: new Date().toISOString(),
    })
  }
}

