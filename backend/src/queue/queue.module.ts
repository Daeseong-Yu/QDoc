import { Module } from '@nestjs/common'

import { QueueController } from './queue.controller'
import { QueueGateway } from './queue.gateway'
import { NotificationService } from './notification.service'
import { QueueService } from './queue.service'
import { WaitTimeService } from './wait-time.service'

@Module({
  controllers: [QueueController],
  providers: [QueueService, WaitTimeService, NotificationService, QueueGateway],
  exports: [QueueService],
})
export class QueueModule {}
