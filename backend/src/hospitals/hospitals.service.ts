import { Injectable, NotFoundException } from '@nestjs/common'

import type { QueueStatus } from '../common/contracts'
import { PrismaService } from '../prisma/prisma.service'
import { HospitalSort, SearchHospitalsDto } from './dto/search-hospitals.dto'

function queueStatusRank(status: QueueStatus) {
  switch (status) {
    case 'Open':
      return 0
    case 'Paused':
      return 1
    case 'Closed':
      return 2
    default:
      return 3
  }
}

function parseDistanceKm(location: string | null | undefined) {
  const match = location?.match(/(\d+(?:\.\d+)?)/)
  return match ? Number(match[1]) : 0
}

function buildDepartments(clinicId: number, clinicName: string) {
  const lower = clinicName.toLowerCase()
  const departments = [{ id: `${clinicId}-family`, name: 'Family care' }]

  if (lower.includes('urgent')) {
    departments.unshift({ id: `${clinicId}-urgent`, name: 'Urgent care' })
  } else {
    departments.push({ id: `${clinicId}-walkin`, name: 'Walk-in care' })
  }

  if (lower.includes('university')) {
    departments.push({ id: `${clinicId}-pediatrics`, name: 'Pediatrics' })
  }

  return departments
}

function buildDoctors(departmentId: string, departmentName: string) {
  if (departmentName === 'Urgent care') {
    return [
      { id: `${departmentId}-doctor-1`, name: 'Dr. Singh' },
      { id: `${departmentId}-doctor-2`, name: 'Dr. Campbell' },
    ]
  }

  if (departmentName === 'Pediatrics') {
    return [
      { id: `${departmentId}-doctor-1`, name: 'Dr. Patel' },
      { id: `${departmentId}-doctor-2`, name: 'Dr. Brown' },
    ]
  }

  if (departmentName === 'Walk-in care') {
    return [
      { id: `${departmentId}-doctor-1`, name: 'Dr. Nguyen' },
      { id: `${departmentId}-doctor-2`, name: 'Dr. Walker' },
    ]
  }

  return [
    { id: `${departmentId}-doctor-1`, name: 'Dr. Carter' },
    { id: `${departmentId}-doctor-2`, name: 'Dr. Lee' },
  ]
}

type HospitalView = {
  id: string
  name: string
  address: string
  phone: string
  lat: number
  lng: number
  queueStatus: QueueStatus
  departments: Array<{ id: string; name: string }>
  currentWaiting: number
  estimatedWaitMin: number
  lastUpdatedAt: string
  distanceKm: number
}

@Injectable()
export class HospitalsService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: SearchHospitalsDto) {
    const clinics = await this.prisma.clinic.findMany({
      include: {
        patientQueues: {
          where: {
            status: 'Waiting',
          },
          orderBy: {
            createdAt: 'asc',
          },
          select: {
            queueId: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        clinicId: 'asc',
      },
    })

    const keyword = query.keyword?.trim().toLowerCase() ?? ''
    const departmentKeyword = query.departmentName?.trim().toLowerCase() ?? ''

    const filtered = clinics
      .map<HospitalView>((clinic) => {
        const departments = buildDepartments(clinic.clinicId, clinic.name ?? 'Clinic')
        const currentWaiting = clinic.patientQueues.length
        const avgMin = clinic.avgConsultTimeMinutes
        const lastUpdatedAt = clinic.patientQueues[clinic.patientQueues.length - 1]?.createdAt ?? new Date()

        return {
          id: String(clinic.clinicId),
          name: clinic.name ?? `Clinic ${clinic.clinicId}`,
          address: clinic.location ?? 'Unknown location',
          phone: '+1-000-000-0000',
          lat: 0,
          lng: 0,
          queueStatus: 'Open',
          departments,
          currentWaiting,
          estimatedWaitMin: currentWaiting * avgMin,
          lastUpdatedAt: lastUpdatedAt.toISOString(),
          distanceKm: parseDistanceKm(clinic.location),
        }
      })
      .filter((clinic) => {
        if (!keyword) {
          return true
        }

        return (
          clinic.name.toLowerCase().includes(keyword) ||
          clinic.address.toLowerCase().includes(keyword) ||
          clinic.departments.some((department) => department.name.toLowerCase().includes(keyword))
        )
      })
      .filter((clinic) => {
        if (!departmentKeyword) {
          return true
        }

        return clinic.departments.some((department) => department.name.toLowerCase().includes(departmentKeyword))
      })
      .filter((clinic) => clinic.distanceKm <= query.radiusKm)

    return this.sortHospitals(filtered, query.sortBy)
  }

  async getDepartmentNames() {
    const clinics = await this.prisma.clinic.findMany({
      select: {
        clinicId: true,
        name: true,
      },
    })

    return [...new Set(clinics.flatMap((clinic) => buildDepartments(clinic.clinicId, clinic.name ?? 'Clinic').map((department) => department.name)))].sort(
      (a, b) => a.localeCompare(b),
    )
  }

  async getHospitalById(hospitalId: string) {
    const clinicId = this.parseClinicId(hospitalId)
    const clinic = await this.prisma.clinic.findUnique({
      where: {
        clinicId,
      },
      include: {
        patientQueues: {
          where: {
            status: 'Waiting',
          },
          orderBy: {
            createdAt: 'asc',
          },
          select: {
            createdAt: true,
          },
        },
      },
    })

    if (!clinic) {
      throw new NotFoundException('Hospital not found')
    }

    const departments = buildDepartments(clinic.clinicId, clinic.name ?? 'Clinic')
    const currentWaiting = clinic.patientQueues.length
    const lastUpdatedAt = clinic.patientQueues[clinic.patientQueues.length - 1]?.createdAt ?? new Date()

    return {
      id: String(clinic.clinicId),
      name: clinic.name ?? `Clinic ${clinic.clinicId}`,
      address: clinic.location ?? 'Unknown location',
      phone: '+1-000-000-0000',
      lat: 0,
      lng: 0,
      queueStatus: 'Open',
      departments,
      currentWaiting,
      estimatedWaitMin: currentWaiting * clinic.avgConsultTimeMinutes,
      lastUpdatedAt: lastUpdatedAt.toISOString(),
    }
  }

  async getDepartments(hospitalId: string) {
    const clinicId = this.parseClinicId(hospitalId)
    const clinic = await this.prisma.clinic.findUnique({
      where: {
        clinicId,
      },
      select: {
        clinicId: true,
        name: true,
      },
    })

    if (!clinic) {
      throw new NotFoundException('Hospital not found')
    }

    return {
      hospitalId: String(clinic.clinicId),
      departments: buildDepartments(clinic.clinicId, clinic.name ?? 'Clinic'),
    }
  }

  async getDoctors(hospitalId: string, departmentId: string) {
    const clinicId = this.parseClinicId(hospitalId)
    const clinic = await this.prisma.clinic.findUnique({
      where: {
        clinicId,
      },
      select: {
        clinicId: true,
        name: true,
      },
    })

    if (!clinic) {
      throw new NotFoundException('Hospital not found')
    }

    const department = buildDepartments(clinic.clinicId, clinic.name ?? 'Clinic').find((item) => item.id === departmentId)
    if (!department) {
      throw new NotFoundException('Department not found in hospital')
    }

    return {
      hospitalId: String(clinic.clinicId),
      departmentId,
      doctors: buildDoctors(department.id, department.name),
    }
  }

  private parseClinicId(hospitalId: string) {
    const clinicId = Number(hospitalId)
    if (!Number.isInteger(clinicId) || clinicId <= 0) {
      throw new NotFoundException('Hospital not found')
    }

    return clinicId
  }

  private sortHospitals(items: HospitalView[], sortBy: HospitalSort) {
    const sorted = [...items]

    if (sortBy === 'wait') {
      sorted.sort((a, b) => a.estimatedWaitMin - b.estimatedWaitMin || a.distanceKm - b.distanceKm)
      return sorted
    }

    if (sortBy === 'status') {
      sorted.sort(
        (a, b) => queueStatusRank(a.queueStatus) - queueStatusRank(b.queueStatus) || a.distanceKm - b.distanceKm,
      )
      return sorted
    }

    sorted.sort((a, b) => a.distanceKm - b.distanceKm)
    return sorted
  }
}
