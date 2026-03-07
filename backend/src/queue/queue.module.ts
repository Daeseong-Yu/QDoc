import { Module } from '@nestjs/common'

import { HospitalsModule } from '../hospitals/hospitals.module'
import { QueueController } from './queue.controller'
import { QueueService } from './queue.service'

@Module({
  imports: [HospitalsModule],
  controllers: [QueueController],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
