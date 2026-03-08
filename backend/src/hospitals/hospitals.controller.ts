import { Controller, Get, Inject, Param, Query } from '@nestjs/common'

import { Roles } from '../auth/roles.decorator'
import { SearchHospitalsDto } from './dto/search-hospitals.dto'
import { HospitalsService } from './hospitals.service'

@Controller('hospitals')
export class HospitalsController {
  constructor(@Inject(HospitalsService) private readonly hospitalsService: HospitalsService) {}

  @Get('search')
  @Roles('patient', 'staff', 'admin', 'robot')
  search(@Query() query: SearchHospitalsDto) {
    return this.hospitalsService.search(query)
  }

  @Get('departments')
  @Roles('patient', 'staff', 'admin', 'robot')
  getDepartmentNames() {
    return this.hospitalsService.getDepartmentNames()
  }

  @Get(':hospitalId')
  @Roles('patient', 'staff', 'admin', 'robot')
  getHospitalById(@Param('hospitalId') hospitalId: string) {
    return this.hospitalsService.getHospitalById(hospitalId)
  }

  @Get(':hospitalId/departments')
  @Roles('patient', 'staff', 'admin', 'robot')
  getHospitalDepartments(@Param('hospitalId') hospitalId: string) {
    return this.hospitalsService.getDepartments(hospitalId)
  }

  @Get(':hospitalId/departments/:departmentId/doctors')
  @Roles('patient', 'staff', 'admin', 'robot')
  getDoctors(@Param('hospitalId') hospitalId: string, @Param('departmentId') departmentId: string) {
    return this.hospitalsService.getDoctors(hospitalId, departmentId)
  }
}

