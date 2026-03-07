import type { DepartmentInfo, HospitalOverview, HospitalSearchSort } from '../types/hospital'

type SearchInput = {
  lat: number
  lng: number
  radiusKm: number
  departmentName?: string
  keyword?: string
  sortBy: HospitalSearchSort
}

type HospitalQueueSnapshot = Pick<
  HospitalOverview,
  | 'id'
  | 'name'
  | 'address'
  | 'phone'
  | 'operatingStatus'
  | 'currentWaiting'
  | 'estimatedWaitMin'
  | 'lastUpdatedAt'
>

const DEPARTMENTS: DepartmentInfo[] = [
  { id: 'dept-family', name: 'Family care', doctors: ['Dr. Green', 'Dr. Kim'] },
  { id: 'dept-urgent', name: 'Urgent care', doctors: ['Dr. Patel'] },
  { id: 'dept-pediatrics', name: 'Pediatrics', doctors: ['Dr. Smith'] },
]

const HOSPITALS: HospitalOverview[] = [
  {
    id: 'h-100',
    name: 'Downtown Walk-In Clinic',
    address: '120 King St W, Toronto',
    phone: '+1-416-555-0101',
    lat: 43.6476,
    lng: -79.3816,
    distanceKm: 0.6,
    estimatedWaitMin: 18,
    currentWaiting: 4,
    operatingStatus: 'open',
    lastUpdatedAt: new Date().toISOString(),
    departments: [DEPARTMENTS[0], DEPARTMENTS[1]],
  },
  {
    id: 'h-101',
    name: 'Harbourfront Medical Centre',
    address: '55 Queens Quay W, Toronto',
    phone: '+1-416-555-0134',
    lat: 43.6408,
    lng: -79.3807,
    distanceKm: 1.4,
    estimatedWaitMin: 11,
    currentWaiting: 2,
    operatingStatus: 'open',
    lastUpdatedAt: new Date().toISOString(),
    departments: [DEPARTMENTS[0], DEPARTMENTS[2]],
  },
  {
    id: 'h-102',
    name: 'West End Community Clinic',
    address: '890 Dundas St W, Toronto',
    phone: '+1-416-555-0188',
    lat: 43.6505,
    lng: -79.4142,
    distanceKm: 3.2,
    estimatedWaitMin: 26,
    currentWaiting: 7,
    operatingStatus: 'closing_soon',
    lastUpdatedAt: new Date().toISOString(),
    departments: [DEPARTMENTS[1]],
  },
]

function matchKeyword(hospital: HospitalOverview, keyword?: string) {
  if (!keyword) {
    return true
  }

  const normalized = keyword.trim().toLowerCase()
  if (!normalized) {
    return true
  }

  return [hospital.name, hospital.address, ...hospital.departments.map((department) => department.name)]
    .join(' ')
    .toLowerCase()
    .includes(normalized)
}

function matchDepartment(hospital: HospitalOverview, departmentName?: string) {
  if (!departmentName) {
    return true
  }

  const normalized = departmentName.trim().toLowerCase()
  if (!normalized) {
    return true
  }

  return hospital.departments.some((department) => department.name.toLowerCase().includes(normalized))
}

function sortHospitals(items: HospitalOverview[], sortBy: HospitalSearchSort) {
  const next = [...items]

  if (sortBy === 'wait') {
    next.sort((a, b) => a.estimatedWaitMin - b.estimatedWaitMin)
    return next
  }

  if (sortBy === 'status') {
    const rank = { open: 0, closing_soon: 1, paused: 2, closed: 3 } as const
    next.sort((a, b) => rank[a.operatingStatus] - rank[b.operatingStatus] || a.distanceKm - b.distanceKm)
    return next
  }

  next.sort((a, b) => a.distanceKm - b.distanceKm)
  return next
}

export async function searchNearbyHospitals(input: SearchInput): Promise<HospitalOverview[]> {
  const filtered = HOSPITALS.filter(
    (hospital) => matchKeyword(hospital, input.keyword) && matchDepartment(hospital, input.departmentName),
  )

  return sortHospitals(filtered, input.sortBy)
}

export async function getHospitalQueueSnapshotById(id: string): Promise<HospitalQueueSnapshot | null> {
  const hospital = HOSPITALS.find((item) => item.id === id)
  if (!hospital) {
    return null
  }

  return {
    id: hospital.id,
    name: hospital.name,
    address: hospital.address,
    phone: hospital.phone,
    operatingStatus: hospital.operatingStatus,
    currentWaiting: hospital.currentWaiting,
    estimatedWaitMin: hospital.estimatedWaitMin,
    lastUpdatedAt: hospital.lastUpdatedAt,
  }
}

export async function getHospitalDepartmentsWithDoctors(hospitalId: string) {
  const hospital = HOSPITALS.find((item) => item.id === hospitalId)
  return hospital?.departments ?? []
}
