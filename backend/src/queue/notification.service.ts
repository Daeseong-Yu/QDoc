import { Inject, Injectable, Logger } from '@nestjs/common'

import { NotificationStage } from '../common/contracts'
import { PrismaService } from '../prisma/prisma.service'

function hasPrismaErrorCode(error: unknown, code: string) {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === code,
  )
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name)

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async evaluateStages(ticketId: string, peopleAhead: number, estimatedWaitMin: number) {
    const triggered: NotificationStage[] = []

    if (peopleAhead <= 2 || estimatedWaitMin <= 10) {
      const created = await this.tryCreateNotification(ticketId, 'Stage1')
      if (created) {
        triggered.push('Stage1')
      }
    }

    if (peopleAhead <= 1 || estimatedWaitMin <= 5) {
      const created = await this.tryCreateNotification(ticketId, 'Stage2')
      if (created) {
        triggered.push('Stage2')
      }
    }

    return triggered
  }

  private async tryCreateNotification(ticketId: string, stage: NotificationStage) {
    try {
      await this.prisma.notificationLog.create({
        data: {
          ticketId,
          stage,
        },
      })
    } catch (error) {
      if (hasPrismaErrorCode(error, 'P2002')) {
        return false
      }

      throw error
    }

    this.logger.log(`Notification triggered: ${stage} for ticket=${ticketId}`)

    return true
  }
}

