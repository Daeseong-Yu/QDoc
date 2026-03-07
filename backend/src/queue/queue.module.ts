import { Module } from '@nestjs/common'

import { HospitalsModule } from '../hospitals/hospitals.module'
import { QueueController } from './queue.controller'
import { QueueGateway } from './queue.gateway'
import { QueueService } from './queue.service'

@Module({
  imports: [HospitalsModule],
  controllers: [QueueController],
  providers: [QueueService, QueueGateway],
  exports: [QueueService],
})
export class QueueModule {}
