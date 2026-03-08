import { Body, Controller, Get, Inject, Post } from '@nestjs/common'

import { Roles } from '../auth/roles.decorator'
import { UpsertUiPathSnapshotDto } from './dto/upsert-snapshot.dto'
import { UiPathService } from './uipath.service'

@Controller('uipath')
export class UiPathController {
  constructor(@Inject(UiPathService) private readonly uiPathService: UiPathService) {}

  @Post('snapshots')
  @Roles('robot', 'staff', 'admin')
  ingestSnapshot(@Body() body: UpsertUiPathSnapshotDto) {
    return this.uiPathService.ingestSnapshot(body)
  }

  @Get('snapshots/latest')
  @Roles('patient', 'staff', 'admin', 'robot')
  getLatestSnapshots() {
    return this.uiPathService.getLatestSnapshots()
  }
}

