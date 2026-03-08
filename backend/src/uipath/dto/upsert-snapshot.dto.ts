import { IsDateString, IsInt, IsOptional, IsString, Length, Min } from 'class-validator'

export class UpsertUiPathSnapshotDto {
  @IsString()
  @Length(3, 50)
  hospitalId!: string

  @IsOptional()
  @IsString()
  @Length(3, 50)
  queueId?: string

  @IsInt()
  @Min(1)
  averageMinutes!: number

  @IsInt()
  @Min(0)
  waitingCount!: number

  @IsOptional()
  @IsDateString()
  capturedAt?: string

  @IsOptional()
  @IsString()
  @Length(1, 50)
  source?: string
}
