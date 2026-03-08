import { apiRequest } from './apiClient'
import type { SymptomAnalysisResult } from '../types/symptom'

type ApiSymptomResponse = {
  urgencyLevel: 'low' | 'medium' | 'high'
  recommendedDepartment: string
  recommendation: string
}

function mapUrgency(value: ApiSymptomResponse['urgencyLevel']): SymptomAnalysisResult['urgency'] {
  if (value === 'medium') {
    return 'moderate'
  }

  return value
}

export async function analyzeSymptomText(text: string): Promise<SymptomAnalysisResult> {
  const result = await apiRequest<ApiSymptomResponse>('/symptoms/analyze', {
    method: 'POST',
    body: JSON.stringify({ symptomText: text }),
  })

  return {
    summary: result.recommendation,
    recommendedDepartment: result.recommendedDepartment,
    urgency: mapUrgency(result.urgencyLevel),
    guidance: result.recommendation,
  }
}
