import { IsOptional, IsString, MaxLength } from 'class-validator'

export class CancelTicketDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string
}
