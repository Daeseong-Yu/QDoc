import { Body, Controller, Headers, Post } from '@nestjs/common'

import { AnalyzeSymptomsDto } from './dto/analyze-symptoms.dto'
import { SymptomsService } from './symptoms.service'

@Controller('symptoms')
export class SymptomsController {
  constructor(private readonly symptomsService: SymptomsService) {}

  @Post('analyze')
  async analyze(@Body() body: AnalyzeSymptomsDto, @Headers('x-user-id') userId?: string) {
    const result = this.symptomsService.analyze(body.symptomText)

    await this.symptomsService.saveHistory({
      customerId: userId?.trim() || null,
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
