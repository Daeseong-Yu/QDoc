import { Transform, Type } from 'class-transformer'
import { IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator'

export const HOSPITAL_SORT_VALUES = ['distance', 'wait', 'status'] as const
export type HospitalSort = (typeof HOSPITAL_SORT_VALUES)[number]

export class SearchHospitalsDto {
  @Type(() => Number)
  @IsNumber()
  lat!: number

  @Type(() => Number)
  @IsNumber()
  lng!: number

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  radiusKm = 15

  @IsOptional()
  @IsString()
  keyword?: string

  @IsOptional()
  @IsString()
  departmentName?: string

  @Transform(({ value }) => value ?? 'distance')
  @IsEnum(HOSPITAL_SORT_VALUES)
  sortBy: HospitalSort = 'distance'
}
