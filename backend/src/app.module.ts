import { Module } from '@nestjs/common'

import { HospitalsModule } from './hospitals/hospitals.module'
import { QueueModule } from './queue/queue.module'
import { SymptomsModule } from './symptoms/symptoms.module'

@Module({
  imports: [HospitalsModule, SymptomsModule, QueueModule],
})
export class AppModule {}
