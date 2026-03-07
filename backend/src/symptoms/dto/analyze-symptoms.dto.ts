import { IsString, Length } from 'class-validator'

export class AnalyzeSymptomsDto {
  @IsString()
  @Length(5, 2000)
  symptomText!: string
}
