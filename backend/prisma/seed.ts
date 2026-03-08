import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  await prisma.notificationLog.deleteMany()
  await prisma.queueTicket.deleteMany()
  await prisma.waitTimeSnapshot.deleteMany()
  await prisma.queue.deleteMany()
  await prisma.doctor.deleteMany()
  await prisma.department.deleteMany()
  await prisma.familyMember.deleteMany()
  await prisma.customer.deleteMany()
  await prisma.hospital.deleteMany()
  await prisma.symptomAnalysisHistory.deleteMany()

  await prisma.customer.createMany({
    data: [
      {
        id: 'cust-001',
        authUserId: 'auth0|patient-demo',
        name: 'QDoc Demo Patient',
        phone: '+1-416-555-9000',
      },
      {
        id: 'cust-002',
        authUserId: 'auth0|patient-jamie',
        name: 'Jamie Park',
        phone: '+1-416-555-9001',
      },
      {
        id: 'cust-003',
        authUserId: 'auth0|patient-sam',
        name: 'Sam Lee',
        phone: '+1-416-555-9002',
      },
      {
        id: 'cust-004',
        authUserId: 'auth0|patient-nova',
        name: 'Nova Tan',
        phone: '+1-416-555-9003',
      },
    ],
  })

  await prisma.familyMember.createMany({
    data: [
      {
        id: 'fam-001',
        customerId: 'cust-001',
        name: 'Mia Kim',
        relationship: 'Daughter',
      },
      {
        id: 'fam-002',
        customerId: 'cust-001',
        name: 'Alex Kim',
        relationship: 'Spouse',
      },
    ],
  })

  await prisma.hospital.createMany({
    data: [
      {
        id: 'hosp-01',
        name: 'Maple Downtown Clinic',
        address: '120 King St W, Toronto, ON',
        phone: '+1-416-555-0101',
        lat: 43.6487,
        lng: -79.3832,
        queueStatus: 'Open',
        avgMin: 5,
      },
      {
        id: 'hosp-02',
        name: 'Lakeside Family Health',
        address: '88 Queens Quay W, Toronto, ON',
        phone: '+1-416-555-0102',
        lat: 43.6405,
        lng: -79.3817,
        queueStatus: 'Open',
        avgMin: 6,
      },
      {
        id: 'hosp-03',
        name: 'North Point Medical Center',
        address: '510 Bloor St W, Toronto, ON',
        phone: '+1-416-555-0103',
        lat: 43.6654,
        lng: -79.4128,
        queueStatus: 'Open',
        avgMin: 5,
      },
      {
        id: 'hosp-04',
        name: 'Harbor Urgent Care',
        address: '225 Front St E, Toronto, ON',
        phone: '+1-416-555-0104',
        lat: 43.6528,
        lng: -79.3693,
        queueStatus: 'Paused',
        avgMin: 7,
      },
      {
        id: 'hosp-05',
        name: 'West End Skin and Kids Clinic',
        address: '920 Dundas St W, Toronto, ON',
        phone: '+1-416-555-0105',
        lat: 43.6509,
        lng: -79.4206,
        queueStatus: 'Open',
        avgMin: 5,
      },
      {
        id: 'hosp-06',
        name: 'South General Clinic',
        address: '45 The Esplanade, Toronto, ON',
        phone: '+1-416-555-0106',
        lat: 43.6469,
        lng: -79.3733,
        queueStatus: 'Closed',
        avgMin: 5,
      },
    ],
  })

  await prisma.department.createMany({
    data: [
      { id: 'dep-001', hospitalId: 'hosp-01', name: 'Internal Medicine', code: 'IM' },
      { id: 'dep-002', hospitalId: 'hosp-01', name: 'Dermatology', code: 'DERM' },
      { id: 'dep-003', hospitalId: 'hosp-02', name: 'Family Medicine', code: 'FM' },
      { id: 'dep-004', hospitalId: 'hosp-02', name: 'Pediatrics', code: 'PED' },
      { id: 'dep-005', hospitalId: 'hosp-03', name: 'Internal Medicine', code: 'IM' },
      { id: 'dep-006', hospitalId: 'hosp-03', name: 'ENT', code: 'ENT' },
      { id: 'dep-007', hospitalId: 'hosp-04', name: 'Emergency Medicine', code: 'EM' },
      { id: 'dep-008', hospitalId: 'hosp-04', name: 'Internal Medicine', code: 'IM' },
      { id: 'dep-009', hospitalId: 'hosp-05', name: 'Dermatology', code: 'DERM' },
      { id: 'dep-010', hospitalId: 'hosp-05', name: 'Pediatrics', code: 'PED' },
      { id: 'dep-011', hospitalId: 'hosp-06', name: 'Internal Medicine', code: 'IM' },
    ],
  })

  await prisma.doctor.createMany({
    data: [
      { id: 'doc-001', departmentId: 'dep-001', name: 'Dr. Lee', specialty: 'Internal Medicine' },
      { id: 'doc-002', departmentId: 'dep-001', name: 'Dr. Tan', specialty: 'Internal Medicine' },
      { id: 'doc-003', departmentId: 'dep-002', name: 'Dr. Park', specialty: 'Dermatology' },
      { id: 'doc-004', departmentId: 'dep-003', name: 'Dr. Morgan', specialty: 'Family Medicine' },
      { id: 'doc-005', departmentId: 'dep-004', name: 'Dr. Choi', specialty: 'Pediatrics' },
      { id: 'doc-006', departmentId: 'dep-005', name: 'Dr. Silva', specialty: 'Internal Medicine' },
      { id: 'doc-007', departmentId: 'dep-006', name: 'Dr. Ahmed', specialty: 'ENT' },
      { id: 'doc-008', departmentId: 'dep-007', name: 'Dr. Johnson', specialty: 'Emergency Medicine' },
      { id: 'doc-009', departmentId: 'dep-008', name: 'Dr. Wong', specialty: 'Internal Medicine' },
      { id: 'doc-010', departmentId: 'dep-009', name: 'Dr. Kim', specialty: 'Dermatology' },
      { id: 'doc-011', departmentId: 'dep-010', name: 'Dr. Patel', specialty: 'Pediatrics' },
      { id: 'doc-012', departmentId: 'dep-011', name: 'Dr. Novak', specialty: 'Internal Medicine' },
    ],
  })

  await prisma.queue.createMany({
    data: [
      { id: 'queue-001', hospitalId: 'hosp-01', departmentId: 'dep-001', status: 'Open', avgMin: 5 },
      { id: 'queue-002', hospitalId: 'hosp-02', departmentId: 'dep-003', status: 'Open', avgMin: 6 },
      { id: 'queue-003', hospitalId: 'hosp-03', departmentId: 'dep-005', status: 'Open', avgMin: 5 },
      { id: 'queue-004', hospitalId: 'hosp-04', departmentId: 'dep-007', status: 'Paused', avgMin: 7 },
      { id: 'queue-005', hospitalId: 'hosp-05', departmentId: 'dep-009', status: 'Open', avgMin: 5 },
      { id: 'queue-006', hospitalId: 'hosp-06', departmentId: 'dep-011', status: 'Closed', avgMin: 5 },
    ],
  })

  const now = new Date()
  const minsAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000)

  await prisma.queueTicket.createMany({
    data: [
      {
        id: 'ticket-001',
        queueId: 'queue-001',
        customerId: 'cust-002',
        status: 'Waiting',
        ticketNumber: 101,
        createdAt: minsAgo(18),
        updatedAt: minsAgo(18),
      },
      {
        id: 'ticket-002',
        queueId: 'queue-001',
        customerId: 'cust-003',
        status: 'Waiting',
        ticketNumber: 102,
        createdAt: minsAgo(14),
        updatedAt: minsAgo(14),
      },
      {
        id: 'ticket-003',
        queueId: 'queue-001',
        customerId: 'cust-004',
        status: 'Called',
        ticketNumber: 103,
        calledAt: minsAgo(2),
        createdAt: minsAgo(10),
        updatedAt: minsAgo(2),
      },
      {
        id: 'ticket-004',
        queueId: 'queue-002',
        customerId: 'cust-001',
        status: 'Waiting',
        ticketNumber: 205,
        createdAt: minsAgo(9),
        updatedAt: minsAgo(9),
      },
      {
        id: 'ticket-005',
        queueId: 'queue-002',
        customerId: 'cust-003',
        status: 'Waiting',
        ticketNumber: 206,
        createdAt: minsAgo(7),
        updatedAt: minsAgo(7),
      },
      {
        id: 'ticket-006',
        queueId: 'queue-004',
        customerId: 'cust-004',
        status: 'Waiting',
        ticketNumber: 401,
        createdAt: minsAgo(30),
        updatedAt: minsAgo(30),
      },
      {
        id: 'ticket-007',
        queueId: 'queue-006',
        customerId: 'cust-002',
        status: 'Cancelled',
        ticketNumber: 601,
        cancelledReason: 'Closed for today',
        createdAt: minsAgo(120),
        updatedAt: minsAgo(110),
      },
    ],
  })

  await prisma.waitTimeSnapshot.createMany({
    data: [
      {
        id: 'snap-001',
        hospitalId: 'hosp-01',
        queueId: 'queue-001',
        source: 'seed',
        averageMinutes: 5,
        waitingCount: 2,
        capturedAt: minsAgo(1),
      },
      {
        id: 'snap-002',
        hospitalId: 'hosp-02',
        queueId: 'queue-002',
        source: 'seed',
        averageMinutes: 6,
        waitingCount: 2,
        capturedAt: minsAgo(1),
      },
      {
        id: 'snap-003',
        hospitalId: 'hosp-04',
        queueId: 'queue-004',
        source: 'UiPath',
        averageMinutes: 7,
        waitingCount: 1,
        capturedAt: minsAgo(4),
      },
    ],
  })

  await prisma.notificationLog.createMany({
    data: [
      {
        id: 'notify-001',
        ticketId: 'ticket-003',
        stage: 'Stage1',
        sentAt: minsAgo(3),
      },
    ],
  })

  await prisma.symptomAnalysisHistory.createMany({
    data: [
      {
        id: 'sym-001',
        customerId: 'cust-001',
        symptomText: 'Mild fever, sore throat',
        urgencyLevel: 'medium',
        recommendedDepartment: 'Internal Medicine',
        recommendation: 'Hydration and same-day outpatient visit recommended.',
        confidence: 0.72,
      },
    ],
  })

  console.log('Seed complete: hospitals, queues, tickets, snapshots loaded.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })


