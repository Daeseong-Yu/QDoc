import { Controller, Get, Param, Query } from '@nestjs/common'

import { SearchHospitalsDto } from './dto/search-hospitals.dto'
import { HospitalsService } from './hospitals.service'

@Controller('hospitals')
export class HospitalsController {
  constructor(private readonly hospitalsService: HospitalsService) {}

  @Get('search')
  search(@Query() query: SearchHospitalsDto) {
    return this.hospitalsService.search(query)
  }

  @Get('departments')
  getDepartmentNames() {
    return this.hospitalsService.getDepartmentNames()
  }

  @Get(':hospitalId')
  getHospitalById(@Param('hospitalId') hospitalId: string) {
    return this.hospitalsService.getHospitalById(hospitalId)
  }

  @Get(':hospitalId/departments')
  getHospitalDepartments(@Param('hospitalId') hospitalId: string) {
    return this.hospitalsService.getDepartments(hospitalId)
  }

  @Get(':hospitalId/departments/:departmentId/doctors')
  getDoctors(@Param('hospitalId') hospitalId: string, @Param('departmentId') departmentId: string) {
    return this.hospitalsService.getDoctors(hospitalId, departmentId)
  }
}
