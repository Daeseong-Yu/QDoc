export type SymptomUrgency = 'low' | 'moderate' | 'high'

export type SymptomAnalysisResult = {
  summary: string
  recommendedDepartment: string
  urgency: SymptomUrgency
  guidance: string
}
