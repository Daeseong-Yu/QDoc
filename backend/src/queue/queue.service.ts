import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'

import { HospitalsService } from '../hospitals/hospitals.service'
import { EnrollTicketDto } from './dto/enroll-ticket.dto'

type UserContext = {
  id: string
  name: string
}

type TicketStatus = 'Waiting' | 'Called' | 'InService' | 'Done' | 'Cancelled' | 'NoShow'

type QueueTicketRecord = {
  id: string
  queueId: string
  hospitalId: string
  hospitalName: string
  departmentId: string
  ticketNumber: number
  customerId: string
  customerName: string
  familyMemberId: string | null
  familyMemberName: string | null
  status: TicketStatus
  cancelledReason: string | null
  createdAt: string
  updatedAt: string
}

type WaitSummary = {
  peopleAhead: number
  avgMin: number
  estimatedWaitMin: number
}

const ACTIVE_STATUSES: TicketStatus[] = ['Waiting', 'Called', 'InService']

@Injectable()
export class QueueService {
  private readonly tickets: QueueTicketRecord[] = []

  constructor(private readonly hospitalsService: HospitalsService) {}

  listMyTickets(user: UserContext) {
    return this.tickets
      .filter((ticket) => ticket.customerId === user.id)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((ticket) => this.toApiTicket(ticket))
  }

  getTicket(ticketId: string) {
    const ticket = this.tickets.find((item) => item.id === ticketId)
    if (!ticket) {
      throw new NotFoundException('Ticket not found')
    }

    return this.toApiTicket(ticket)
  }

  enroll(user: UserContext, input: EnrollTicketDto) {
    if (input.targetType !== 'self') {
      throw new BadRequestException('MVP supports self target only')
    }

    const hospital = this.hospitalsService.getHospitalById(input.hospitalId)
    if (hospital.queueStatus !== 'Open') {
      throw new BadRequestException('Queue is not accepting new registrations')
    }

    const departments = this.hospitalsService.getDepartments(input.hospitalId).departments
    const selectedDepartment = input.departmentId
      ? departments.find((department) => department.id === input.departmentId)
      : departments[0]

    if (!selectedDepartment) {
      throw new NotFoundException('Queue for department not found')
    }

    const duplicate = this.tickets.find(
      (ticket) =>
        ticket.customerId === user.id &&
        ticket.familyMemberId === null &&
        ACTIVE_STATUSES.includes(ticket.status),
    )

    if (duplicate) {
      throw new ConflictException('You already have an active queue ticket for this target')
    }

    const queueId = `${input.hospitalId}:${selectedDepartment.id}`
    const latestTicketNumber = this.tickets
      .filter((ticket) => ticket.queueId === queueId)
      .reduce((max, ticket) => Math.max(max, ticket.ticketNumber), 100)

    const createdAt = new Date().toISOString()
    const ticket: QueueTicketRecord = {
      id: this.createId(),
      queueId,
      hospitalId: hospital.id,
      hospitalName: hospital.name,
      departmentId: selectedDepartment.id,
      ticketNumber: latestTicketNumber + 1,
      customerId: user.id,
      customerName: user.name,
      familyMemberId: input.familyMemberId ?? null,
      familyMemberName: input.familyMemberId ? input.targetName : null,
      status: 'Waiting',
      cancelledReason: null,
      createdAt,
      updatedAt: createdAt,
    }

    this.tickets.push(ticket)

    return {
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        familyMemberId: ticket.familyMemberId,
        status: ticket.status,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        cancelledReason: ticket.cancelledReason,
      },
      wait: this.calculateWait(ticket),
      notifications: ['Queue registration completed.'],
    }
  }

  private toApiTicket(ticket: QueueTicketRecord) {
    const avgMin = this.calculateWait(ticket).avgMin

    return {
      id: ticket.id,
      queueId: ticket.queueId,
      familyMemberId: ticket.familyMemberId,
      status: ticket.status,
      ticketNumber: ticket.ticketNumber,
      cancelledReason: ticket.cancelledReason,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      queue: {
        id: ticket.queueId,
        avgMin,
        hospital: {
          id: ticket.hospitalId,
          name: ticket.hospitalName,
        },
      },
      familyMember: ticket.familyMemberId
        ? {
            id: ticket.familyMemberId,
            name: ticket.familyMemberName ?? 'Family Member',
          }
        : null,
      wait: this.calculateWait(ticket),
    }
  }

  private calculateWait(ticket: QueueTicketRecord): WaitSummary {
    const hospital = this.hospitalsService.getHospitalById(ticket.hospitalId)
    const queueTickets = this.tickets
      .filter((item) => item.queueId === ticket.queueId && ACTIVE_STATUSES.includes(item.status))
      .sort((a, b) => a.ticketNumber - b.ticketNumber)

    const peopleAhead = queueTickets.filter((item) => item.ticketNumber < ticket.ticketNumber).length
    const seedWaiting = Math.max(hospital.currentWaiting, 1)
    const avgMin = Math.max(4, Math.round(hospital.estimatedWaitMin / seedWaiting))

    return {
      peopleAhead,
      avgMin,
      estimatedWaitMin: peopleAhead * avgMin,
    }
  }

  private createId() {
    return `ticket-${Date.now()}-${Math.round(Math.random() * 1000)}`
  }
}
