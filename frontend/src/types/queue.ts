export type QueueTargetType = 'self' | 'family'

export type QueueTicketStatus = 'Waiting' | 'Called' | 'InService' | 'Done' | 'Cancelled' | 'NoShow'

export type QueueTicket = {
  id: string
  hospitalId: string
  hospitalName: string
  queueNumber: number
  targetType: QueueTargetType
  targetName: string
  familyMemberId: string | null
  status: QueueTicketStatus
  peopleAhead: number
  avgMin: number
  estimatedWaitMin: number
  createdAt: string
  updatedAt: string
  cancelledReason: string | null
}

export type QueueEnrollInput = {
  hospitalId: string
  departmentId?: string
  targetType: QueueTargetType
  targetName: string
  familyMemberId: string | null
}

export type QueueEnrollErrorCode =
  | 'HOSPITAL_NOT_FOUND'
  | 'QUEUE_UNAVAILABLE'
  | 'DUPLICATE_ACTIVE_TICKET'
  | 'INVALID_TARGET'
