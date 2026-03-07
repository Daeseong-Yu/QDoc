export type SymptomAnalysisResult = {
  summary: string
  recommendedDepartment: string
  urgency: 'low' | 'moderate' | 'high'
  guidance: string
}
