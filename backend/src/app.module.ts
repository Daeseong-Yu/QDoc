import { Module } from '@nestjs/common'

import { HospitalsModule } from './hospitals/hospitals.module'

@Module({
  imports: [HospitalsModule],
})
export class AppModule {}
