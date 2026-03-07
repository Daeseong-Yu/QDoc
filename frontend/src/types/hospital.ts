export type OperatingStatus = 'open' | 'closing_soon' | 'paused' | 'closed'

export type DepartmentInfo = {
  id: string
  name: string
  doctors: string[]
}

export type HospitalOverview = {
  id: string
  name: string
  address: string
  phone: string
  lat: number
  lng: number
  distanceKm: number
  estimatedWaitMin: number
  currentWaiting: number
  operatingStatus: OperatingStatus
  lastUpdatedAt: string
  departments: DepartmentInfo[]
}

export type HospitalSearchSort = 'distance' | 'wait' | 'status'
