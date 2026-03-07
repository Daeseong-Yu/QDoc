import type { SymptomAnalysisResult } from '../types/symptom'
import { apiRequest } from './apiClient'

type BackendSymptomAnalysis = {
  urgencyLevel: 'low' | 'medium' | 'high'
  recommendedDepartment: string
  recommendation: string
  confidence: number
  disclaimer: string
  analyzedAt: string
}

function mapUrgency(urgencyLevel: BackendSymptomAnalysis['urgencyLevel']): SymptomAnalysisResult['urgency'] {
  if (urgencyLevel === 'medium') {
    return 'moderate'
  }

  return urgencyLevel
}

export async function analyzeSymptomText(text: string): Promise<SymptomAnalysisResult> {
  const normalized = text.trim()
  if (normalized.length < 5) {
    throw new Error('Please describe your symptoms in at least 5 characters.')
  }

  const result = await apiRequest<BackendSymptomAnalysis>('/symptoms/analyze', {
    body: {
      symptomText: normalized,
    },
  })

  return {
    summary: `Recommended department: ${result.recommendedDepartment}`,
    recommendedDepartment: result.recommendedDepartment,
    urgency: mapUrgency(result.urgencyLevel),
    guidance: result.recommendation,
  }
}
