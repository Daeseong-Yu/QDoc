import { Body, Controller, Post } from '@nestjs/common'

import { AnalyzeSymptomsDto } from './dto/analyze-symptoms.dto'
import { SymptomsService } from './symptoms.service'

@Controller('symptoms')
export class SymptomsController {
  constructor(private readonly symptomsService: SymptomsService) {}

  @Post('analyze')
  analyze(@Body() body: AnalyzeSymptomsDto) {
    const result = this.symptomsService.analyze(body.symptomText)

    return {
      ...result,
      disclaimer:
        'This triage result is informational only and does not replace professional medical diagnosis.',
      analyzedAt: new Date().toISOString(),
    }
  }
}
