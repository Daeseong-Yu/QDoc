import { Module } from '@nestjs/common'

import { SymptomsController } from './symptoms.controller'
import { SymptomsService } from './symptoms.service'

@Module({
  controllers: [SymptomsController],
  providers: [SymptomsService],
})
export class SymptomsModule {}
