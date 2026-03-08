import { Module } from '@nestjs/common'

import { UiPathController } from './uipath.controller'
import { UiPathService } from './uipath.service'

@Module({
  controllers: [UiPathController],
  providers: [UiPathService],
})
export class UiPathModule {}
