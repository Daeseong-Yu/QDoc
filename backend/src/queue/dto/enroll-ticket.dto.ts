import { Type } from 'class-transformer'
import { IsEnum, IsOptional, IsString, Length } from 'class-validator'

export const QUEUE_TARGET_TYPES = ['self', 'family'] as const
export type QueueTargetType = (typeof QUEUE_TARGET_TYPES)[number]

export class EnrollTicketDto {
  @IsString()
  @Length(3, 50)
  hospitalId!: string

  @IsOptional()
  @IsString()
  @Length(3, 50)
  departmentId?: string

  @IsEnum(QUEUE_TARGET_TYPES)
  targetType!: QueueTargetType

  @Type(() => String)
  @IsString()
  @Length(1, 80)
  targetName!: string

  @IsOptional()
  @IsString()
  @Length(3, 50)
  familyMemberId?: string
}
