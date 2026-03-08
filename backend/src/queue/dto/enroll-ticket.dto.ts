import { IsEnum, IsOptional, IsString, Length } from 'class-validator'

export const QUEUE_TARGET_TYPES = ['self', 'family'] as const
export type QueueTargetType = (typeof QUEUE_TARGET_TYPES)[number]

export class EnrollTicketDto {
  @IsString()
  @Length(1, 50)
  hospitalId!: string

  @IsOptional()
  @IsString()
  @Length(1, 50)
  departmentId?: string

  @IsEnum(QUEUE_TARGET_TYPES)
  targetType!: QueueTargetType

  @IsString()
  @Length(1, 80)
  targetName!: string

  @IsOptional()
  @IsString()
  @Length(1, 50)
  familyMemberId?: string
}

