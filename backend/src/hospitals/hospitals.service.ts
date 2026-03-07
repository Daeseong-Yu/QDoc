import { Injectable, NotFoundException } from '@nestjs/common'

import { HospitalSort, SearchHospitalsDto } from './dto/search-hospitals.dto'

type QueueStatus = 'Open' | 'Paused' | 'Closed'

type DoctorView = {
  id: string
  name: string
}

type DepartmentView = {
  id: string
  name: string
  doctors: DoctorView[]
}

type HospitalRecord = {
  id: string
  name: string
  address: string
  phone: string
  lat: number
  lng: number
  queueStatus: QueueStatus
  currentWaiting: number
  estimatedWaitMin: number
  lastUpdatedAt: string
  departments: DepartmentView[]
}

type HospitalSearchView = {
  id: string
  name: string
  address: string
  phone: string
  lat: number
  lng: number
  distanceKm: number
  estimatedWaitMin: number
  currentWaiting: number
  queueStatus: QueueStatus
  lastUpdatedAt: string
  departments: Array<{ id: string; name: string }>
}

const HOSPITALS: HospitalRecord[] = [
  {
    id: 'h-100',
    name: 'Downtown Walk-In Clinic',
    address: '120 King St W, Toronto',
    phone: '+1-416-555-0101',
    lat: 43.6476,
    lng: -79.3816,
    queueStatus: 'Open',
    currentWaiting: 4,
    estimatedWaitMin: 18,
    lastUpdatedAt: new Date().toISOString(),
    departments: [
      {
        id: 'dept-family',
        name: 'Family care',
        doctors: [
          { id: 'doc-green', name: 'Dr. Green' },
          { id: 'doc-kim', name: 'Dr. Kim' },
        ],
      },
      {
        id: 'dept-urgent',
        name: 'Urgent care',
        doctors: [{ id: 'doc-patel', name: 'Dr. Patel' }],
      },
    ],
  },
  {
    id: 'h-101',
    name: 'Harbourfront Medical Centre',
    address: '55 Queens Quay W, Toronto',
    phone: '+1-416-555-0134',
    lat: 43.6408,
    lng: -79.3807,
    queueStatus: 'Open',
    currentWaiting: 2,
    estimatedWaitMin: 11,
    lastUpdatedAt: new Date().toISOString(),
    departments: [
      {
        id: 'dept-family-2',
        name: 'Family care',
        doctors: [{ id: 'doc-ross', name: 'Dr. Ross' }],
      },
      {
        id: 'dept-pediatrics',
        name: 'Pediatrics',
        doctors: [{ id: 'doc-smith', name: 'Dr. Smith' }],
      },
    ],
  },
  {
    id: 'h-102',
    name: 'West End Community Clinic',
    address: '890 Dundas St W, Toronto',
    phone: '+1-416-555-0188',
    lat: 43.6505,
    lng: -79.4142,
    queueStatus: 'Paused',
    currentWaiting: 7,
    estimatedWaitMin: 26,
    lastUpdatedAt: new Date().toISOString(),
    departments: [
      {
        id: 'dept-urgent-2',
        name: 'Urgent care',
        doctors: [{ id: 'doc-ali', name: 'Dr. Ali' }],
      },
    ],
  },
]

function toRadians(value: number) {
  return (value * Math.PI) / 180
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const earthRadiusKm = 6371
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return earthRadiusKm * c
}

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

function toSearchView(hospital: HospitalRecord, lat: number, lng: number): HospitalSearchView {
  return {
    id: hospital.id,
    name: hospital.name,
    address: hospital.address,
    phone: hospital.phone,
    lat: hospital.lat,
    lng: hospital.lng,
    distanceKm: Number(distanceKm(lat, lng, hospital.lat, hospital.lng).toFixed(2)),
    estimatedWaitMin: hospital.estimatedWaitMin,
    currentWaiting: hospital.currentWaiting,
    queueStatus: hospital.queueStatus,
    lastUpdatedAt: hospital.lastUpdatedAt,
    departments: hospital.departments.map((department) => ({
      id: department.id,
      name: department.name,
    })),
  }
}

@Injectable()
export class HospitalsService {
  search(query: SearchHospitalsDto) {
    const keyword = query.keyword?.trim().toLowerCase() ?? ''
    const departmentKeyword = query.departmentName?.trim().toLowerCase() ?? ''

    const filtered = HOSPITALS.filter((hospital) => {
      if (departmentKeyword) {
        const hasDepartment = hospital.departments.some((department) =>
          department.name.toLowerCase().includes(departmentKeyword),
        )

        if (!hasDepartment) {
          return false
        }
      }

      if (!keyword) {
        return true
      }

      const departmentNames = hospital.departments.map((department) => department.name.toLowerCase())
      return (
        hospital.name.toLowerCase().includes(keyword) ||
        hospital.address.toLowerCase().includes(keyword) ||
        departmentNames.some((name) => name.includes(keyword))
      )
    })
      .map((hospital) => toSearchView(hospital, query.lat, query.lng))
      .filter((hospital) => hospital.distanceKm <= query.radiusKm)

    return this.sortHospitals(filtered, query.sortBy)
  }

  getDepartmentNames() {
    return [...new Set(HOSPITALS.flatMap((hospital) => hospital.departments.map((department) => department.name)))].sort(
      (a, b) => a.localeCompare(b),
    )
  }

  getHospitalById(hospitalId: string) {
    const hospital = HOSPITALS.find((item) => item.id === hospitalId)
    if (!hospital) {
      throw new NotFoundException('Hospital not found')
    }

    return {
      id: hospital.id,
      name: hospital.name,
      address: hospital.address,
      phone: hospital.phone,
      lat: hospital.lat,
      lng: hospital.lng,
      queueStatus: hospital.queueStatus,
      departments: hospital.departments.map((department) => ({ id: department.id, name: department.name })),
      currentWaiting: hospital.currentWaiting,
      estimatedWaitMin: hospital.estimatedWaitMin,
      lastUpdatedAt: hospital.lastUpdatedAt,
    }
  }

  getDepartments(hospitalId: string) {
    const hospital = HOSPITALS.find((item) => item.id === hospitalId)
    if (!hospital) {
      throw new NotFoundException('Hospital not found')
    }

    return {
      hospitalId: hospital.id,
      departments: hospital.departments.map((department) => ({ id: department.id, name: department.name })),
    }
  }

  getDoctors(hospitalId: string, departmentId: string) {
    const hospital = HOSPITALS.find((item) => item.id === hospitalId)
    if (!hospital) {
      throw new NotFoundException('Hospital not found')
    }

    const department = hospital.departments.find((item) => item.id === departmentId)
    if (!department) {
      throw new NotFoundException('Department not found in hospital')
    }

    return {
      hospitalId,
      departmentId,
      doctors: department.doctors,
    }
  }

  private sortHospitals(items: HospitalSearchView[], sortBy: HospitalSort) {
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
