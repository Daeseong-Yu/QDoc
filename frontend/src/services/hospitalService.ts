import type { DepartmentInfo, HospitalOverview, HospitalSearchSort, OperatingStatus } from '../types/hospital'
import { ApiError, apiRequest } from './apiClient'

type SearchInput = {
  lat: number
  lng: number
  radiusKm: number
  departmentName?: string
  keyword?: string
  sortBy: HospitalSearchSort
}

export type HospitalQueueSnapshot = Pick<
  HospitalOverview,
  'id' | 'name' | 'address' | 'phone' | 'operatingStatus' | 'currentWaiting' | 'estimatedWaitMin' | 'lastUpdatedAt'
>

type BackendQueueStatus = 'Open' | 'Paused' | 'Closed'

type BackendDepartmentSummary = {
  id: string
  name: string
}

type BackendDoctor = {
  id: string
  name: string
}

type BackendHospitalSearchResult = {
  id: string
  name: string
  address: string
  phone: string
  lat: number
  lng: number
  distanceKm: number
  estimatedWaitMin: number
  currentWaiting: number
  queueStatus: BackendQueueStatus
  lastUpdatedAt: string
  departments: BackendDepartmentSummary[]
}

type BackendHospitalDetail = {
  id: string
  name: string
  address: string
  phone: string
  lat: number
  lng: number
  queueStatus: BackendQueueStatus
  currentWaiting: number
  estimatedWaitMin: number
  lastUpdatedAt: string
  departments: BackendDepartmentSummary[]
}

type BackendDepartmentResponse = {
  hospitalId: string
  departments: BackendDepartmentSummary[]
}

type BackendDoctorsResponse = {
  hospitalId: string
  departmentId: string
  doctors: BackendDoctor[]
}

function mapOperatingStatus(status: BackendQueueStatus): OperatingStatus {
  switch (status) {
    case 'Open':
      return 'open'
    case 'Paused':
      return 'paused'
    case 'Closed':
      return 'closed'
    default:
      return 'closing_soon'
  }
}

function normalizeDepartmentName(value?: string) {
  const normalized = value?.trim()
  if (!normalized) {
    return undefined
  }

  switch (normalized.toLowerCase()) {
    case 'family medicine':
      return 'Family care'
    case 'urgent care':
    case 'emergency medicine':
      return 'Urgent care'
    case 'internal medicine':
    case 'dermatology':
    case 'ent':
      return undefined
    default:
      return normalized
  }
}

function mapHospitalOverview(hospital: BackendHospitalSearchResult): HospitalOverview {
  return {
    id: hospital.id,
    name: hospital.name,
    address: hospital.address,
    phone: hospital.phone,
    lat: hospital.lat,
    lng: hospital.lng,
    distanceKm: hospital.distanceKm,
    estimatedWaitMin: hospital.estimatedWaitMin,
    currentWaiting: hospital.currentWaiting,
    operatingStatus: mapOperatingStatus(hospital.queueStatus),
    lastUpdatedAt: hospital.lastUpdatedAt,
    departments: hospital.departments.map((department) => ({
      id: department.id,
      name: department.name,
      doctors: [],
    })),
  }
}

function mapHospitalSnapshot(hospital: BackendHospitalDetail): HospitalQueueSnapshot {
  return {
    id: hospital.id,
    name: hospital.name,
    address: hospital.address,
    phone: hospital.phone,
    operatingStatus: mapOperatingStatus(hospital.queueStatus),
    currentWaiting: hospital.currentWaiting,
    estimatedWaitMin: hospital.estimatedWaitMin,
    lastUpdatedAt: hospital.lastUpdatedAt,
  }
}

export async function searchNearbyHospitals(input: SearchInput): Promise<HospitalOverview[]> {
  const hospitals = await apiRequest<BackendHospitalSearchResult[]>('/hospitals/search', {
    query: {
      lat: input.lat,
      lng: input.lng,
      radiusKm: input.radiusKm,
      departmentName: normalizeDepartmentName(input.departmentName),
      keyword: input.keyword?.trim() || undefined,
      sortBy: input.sortBy,
    },
  })

  return hospitals.map(mapHospitalOverview)
}

export async function getHospitalQueueSnapshotById(id: string): Promise<HospitalQueueSnapshot | null> {
  try {
    const hospital = await apiRequest<BackendHospitalDetail>(`/hospitals/${encodeURIComponent(id)}`)
    return mapHospitalSnapshot(hospital)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null
    }

    throw error
  }
}

export async function getHospitalDepartmentsWithDoctors(hospitalId: string): Promise<DepartmentInfo[]> {
  try {
    const { departments } = await apiRequest<BackendDepartmentResponse>(
      `/hospitals/${encodeURIComponent(hospitalId)}/departments`,
    )

    return Promise.all(
      departments.map(async (department) => {
        const detail = await apiRequest<BackendDoctorsResponse>(
          `/hospitals/${encodeURIComponent(hospitalId)}/departments/${encodeURIComponent(department.id)}/doctors`,
        )

        return {
          id: department.id,
          name: department.name,
          doctors: detail.doctors.map((doctor) => doctor.name),
        }
      }),
    )
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return []
    }

    throw error
  }
}
