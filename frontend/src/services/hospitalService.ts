import { ApiError, apiRequest } from './apiClient'
import type { DepartmentInfo, HospitalOverview, HospitalSearchSort, OperatingStatus } from '../types/hospital'

type SearchInput = {
  lat: number
  lng: number
  radiusKm: number
  departmentName?: string
  keyword?: string
  sortBy: HospitalSearchSort
}

type BaseHospital = Omit<HospitalOverview, 'distanceKm'>

export type HospitalQueueSnapshot = Pick<
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

type ApiHospital = {
  id: string
  name: string
  address: string
  phone: string
  lat: number
  lng: number
  distanceKm?: number
  estimatedWaitMin: number
  currentWaiting: number
  queueStatus: 'Open' | 'Paused' | 'Closed'
  lastUpdatedAt: string
  departments: Array<{ id: string; name: string }>
}

type ApiDepartmentsResponse = {
  hospitalId: string
  departments: Array<{ id: string; name: string }>
}

type ApiDoctorsResponse = {
  hospitalId: string
  departmentId: string
  doctors: Array<{ id: string; name: string }>
}

function mapOperatingStatus(status: ApiHospital['queueStatus']): OperatingStatus {
  switch (status) {
    case 'Open':
      return 'open'
    case 'Paused':
      return 'paused'
    case 'Closed':
      return 'closed'
    default:
      return 'closed'
  }
}

function mapDepartments(items: Array<{ id: string; name: string }>): DepartmentInfo[] {
  return items.map((department) => ({
    id: department.id,
    name: department.name,
    doctors: [],
  }))
}

function mapHospital(item: ApiHospital): HospitalOverview {
  return {
    id: item.id,
    name: item.name,
    address: item.address,
    phone: item.phone,
    lat: item.lat,
    lng: item.lng,
    distanceKm: Number((item.distanceKm ?? 0).toFixed(2)),
    estimatedWaitMin: item.estimatedWaitMin,
    currentWaiting: item.currentWaiting,
    operatingStatus: mapOperatingStatus(item.queueStatus),
    lastUpdatedAt: item.lastUpdatedAt,
    departments: mapDepartments(item.departments),
  }
}

export async function getAvailableDepartments() {
  const names = await apiRequest<string[]>('/hospitals/departments')
  return [...names].sort((a, b) => a.localeCompare(b))
}

export async function searchNearbyHospitals(input: SearchInput): Promise<HospitalOverview[]> {
  const params = new URLSearchParams({
    lat: String(input.lat),
    lng: String(input.lng),
    radiusKm: String(input.radiusKm),
    sortBy: input.sortBy,
  })

  if (input.departmentName) {
    params.set('departmentName', input.departmentName)
  }

  if (input.keyword) {
    params.set('keyword', input.keyword)
  }

  const result = await apiRequest<ApiHospital[]>(`/hospitals/search?${params.toString()}`)
  return result.map(mapHospital)
}

export async function getHospitalQueueSnapshotById(id: string): Promise<HospitalQueueSnapshot | null> {
  try {
    const hospital = await apiRequest<ApiHospital>(`/hospitals/${encodeURIComponent(id)}`)

    const mapped: BaseHospital = {
      id: hospital.id,
      name: hospital.name,
      address: hospital.address,
      phone: hospital.phone,
      lat: hospital.lat,
      lng: hospital.lng,
      estimatedWaitMin: hospital.estimatedWaitMin,
      currentWaiting: hospital.currentWaiting,
      operatingStatus: mapOperatingStatus(hospital.queueStatus),
      lastUpdatedAt: hospital.lastUpdatedAt,
      departments: mapDepartments(hospital.departments),
    }

    return {
      id: mapped.id,
      name: mapped.name,
      address: mapped.address,
      phone: mapped.phone,
      operatingStatus: mapped.operatingStatus,
      currentWaiting: mapped.currentWaiting,
      estimatedWaitMin: mapped.estimatedWaitMin,
      lastUpdatedAt: mapped.lastUpdatedAt,
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null
    }

    throw error
  }
}

export async function getHospitalDepartmentsWithDoctors(hospitalId: string) {
  const result = await apiRequest<ApiDepartmentsResponse>(
    `/hospitals/${encodeURIComponent(hospitalId)}/departments`,
  )

  const departments = await Promise.all(
    result.departments.map(async (department) => {
      const doctorsResult = await apiRequest<ApiDoctorsResponse>(
        `/hospitals/${encodeURIComponent(hospitalId)}/departments/${encodeURIComponent(department.id)}/doctors`,
      )

      return {
        id: department.id,
        name: department.name,
        doctors: doctorsResult.doctors.map((doctor) => doctor.name),
      }
    }),
  )

  return departments
}

