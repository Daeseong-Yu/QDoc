import type { HospitalOverview, HospitalSearchSort } from '../types/hospital'

type SearchInput = {
  lat: number
  lng: number
  radiusKm: number
  departmentName?: string
  keyword?: string
  sortBy: HospitalSearchSort
}

const MOCK_HOSPITALS: HospitalOverview[] = [
  {
    id: 'h-001',
    name: 'Downtown Walk-In Clinic',
    address: '123 King St W, Toronto, ON',
    phone: '416-555-0100',
    lat: 43.6487,
    lng: -79.3817,
    distanceKm: 0.7,
    estimatedWaitMin: 12,
    currentWaiting: 6,
    operatingStatus: 'open',
    lastUpdatedAt: new Date().toISOString(),
    departments: [
      { id: 'd-001', name: 'Family Medicine', doctors: ['Dr. Lee', 'Dr. Chen'] },
      { id: 'd-002', name: 'Dermatology', doctors: ['Dr. Park'] },
    ],
  },
  {
    id: 'h-002',
    name: 'Harbourfront Medical Centre',
    address: '88 Queens Quay W, Toronto, ON',
    phone: '416-555-0110',
    lat: 43.6407,
    lng: -79.3815,
    distanceKm: 1.5,
    estimatedWaitMin: 24,
    currentWaiting: 11,
    operatingStatus: 'open',
    lastUpdatedAt: new Date().toISOString(),
    departments: [
      { id: 'd-003', name: 'Pediatrics', doctors: ['Dr. Brown'] },
      { id: 'd-004', name: 'Family Medicine', doctors: ['Dr. Patel'] },
    ],
  },
  {
    id: 'h-003',
    name: 'West End Community Clinic',
    address: '455 Bloor St W, Toronto, ON',
    phone: '416-555-0120',
    lat: 43.6669,
    lng: -79.4074,
    distanceKm: 3.2,
    estimatedWaitMin: 35,
    currentWaiting: 18,
    operatingStatus: 'paused',
    lastUpdatedAt: new Date().toISOString(),
    departments: [
      { id: 'd-005', name: 'Urgent Care', doctors: ['Dr. Singh'] },
      { id: 'd-006', name: 'Family Medicine', doctors: ['Dr. Wilson'] },
    ],
  },
]

function includesText(source: string, keyword?: string) {
  if (!keyword) {
    return true
  }

  return source.toLowerCase().includes(keyword.trim().toLowerCase())
}

export async function searchNearbyHospitals(input: SearchInput): Promise<HospitalOverview[]> {
  const filtered = MOCK_HOSPITALS.filter((hospital) => {
    const matchesKeyword =
      !input.keyword ||
      includesText(hospital.name, input.keyword) ||
      includesText(hospital.address, input.keyword)

    const matchesDepartment =
      !input.departmentName ||
      hospital.departments.some((department) => includesText(department.name, input.departmentName))

    return matchesKeyword && matchesDepartment && hospital.distanceKm <= input.radiusKm
  })

  const ranked = [...filtered]

  if (input.sortBy === 'wait') {
    ranked.sort((a, b) => a.estimatedWaitMin - b.estimatedWaitMin)
  } else if (input.sortBy === 'status') {
    const score = { open: 0, closing_soon: 1, paused: 2, closed: 3 }
    ranked.sort((a, b) => score[a.operatingStatus] - score[b.operatingStatus] || a.distanceKm - b.distanceKm)
  } else {
    ranked.sort((a, b) => a.distanceKm - b.distanceKm)
  }

  return ranked
}
