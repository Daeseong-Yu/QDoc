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

  await prisma.hospital.createMany({
    data: [
      {
        id: 'h-100',
        name: 'Downtown Walk-In Clinic',
        address: '120 King St W, Toronto',
        phone: '+1-416-555-0101',
        lat: 43.6476,
        lng: -79.3816,
        queueStatus: 'Open',
        avgMin: 5,
      },
      {
        id: 'h-101',
        name: 'Harbourfront Medical Centre',
        address: '55 Queens Quay W, Toronto',
        phone: '+1-416-555-0134',
        lat: 43.6408,
        lng: -79.3807,
        queueStatus: 'Open',
        avgMin: 6,
      },
      {
        id: 'h-102',
        name: 'West End Community Clinic',
        address: '890 Dundas St W, Toronto',
        phone: '+1-416-555-0188',
        lat: 43.6505,
        lng: -79.4142,
        queueStatus: 'Paused',
        avgMin: 6,
      },
    ],
  })

  await prisma.department.createMany({
    data: [
      { id: 'dept-family', hospitalId: 'h-100', name: 'Family care', code: 'FM' },
      { id: 'dept-urgent', hospitalId: 'h-100', name: 'Urgent care', code: 'UC' },
      { id: 'dept-family-2', hospitalId: 'h-101', name: 'Family care', code: 'FM' },
      { id: 'dept-pediatrics', hospitalId: 'h-101', name: 'Pediatrics', code: 'PED' },
      { id: 'dept-urgent-2', hospitalId: 'h-102', name: 'Urgent care', code: 'UC' },
    ],
  })

  await prisma.doctor.createMany({
    data: [
      { id: 'doc-green', departmentId: 'dept-family', name: 'Dr. Green', specialty: 'Family care' },
      { id: 'doc-kim', departmentId: 'dept-family', name: 'Dr. Kim', specialty: 'Family care' },
      { id: 'doc-patel', departmentId: 'dept-urgent', name: 'Dr. Patel', specialty: 'Urgent care' },
      { id: 'doc-ross', departmentId: 'dept-family-2', name: 'Dr. Ross', specialty: 'Family care' },
      { id: 'doc-smith', departmentId: 'dept-pediatrics', name: 'Dr. Smith', specialty: 'Pediatrics' },
      { id: 'doc-ali', departmentId: 'dept-urgent-2', name: 'Dr. Ali', specialty: 'Urgent care' },
    ],
  })

  await prisma.queue.createMany({
    data: [
      { id: 'queue-100', hospitalId: 'h-100', departmentId: 'dept-family', status: 'Open', avgMin: 5 },
      { id: 'queue-101', hospitalId: 'h-100', departmentId: 'dept-urgent', status: 'Open', avgMin: 5 },
      { id: 'queue-102', hospitalId: 'h-101', departmentId: 'dept-family-2', status: 'Open', avgMin: 6 },
      { id: 'queue-103', hospitalId: 'h-101', departmentId: 'dept-pediatrics', status: 'Open', avgMin: 6 },
      { id: 'queue-104', hospitalId: 'h-102', departmentId: 'dept-urgent-2', status: 'Paused', avgMin: 6 },
    ],
  })

  console.log('Seed complete: hospitals, departments, doctors, queues loaded.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
