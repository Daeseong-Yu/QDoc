import { Body, Controller, Inject, Post, Req } from '@nestjs/common'

import type { AuthenticatedRequest } from '../auth/authenticated-request'
import { Roles } from '../auth/roles.decorator'
import { AnalyzeSymptomsDto } from './dto/analyze-symptoms.dto'
import { SymptomsService } from './symptoms.service'

@Controller('symptoms')
export class SymptomsController {
  constructor(@Inject(SymptomsService) private readonly symptomsService: SymptomsService) {}

  @Post('analyze')
  @Roles('patient', 'staff', 'admin')
  async analyze(@Body() body: AnalyzeSymptomsDto, @Req() request: AuthenticatedRequest) {
    const result = this.symptomsService.analyze(body.symptomText)

    await this.symptomsService.saveHistory({
      customerId: request.user?.authUserId,
      symptomText: body.symptomText,
      urgencyLevel: result.urgencyLevel,
      recommendedDepartment: result.recommendedDepartment,
      recommendation: result.recommendation,
      confidence: result.confidence,
    })

    return {
      ...result,
      disclaimer:
        'This triage result is informational only and does not replace professional medical diagnosis.',
      analyzedAt: new Date().toISOString(),
    }
  }
}


