import type { SymptomAnalysisResult } from '../types/symptom'

const KEYWORD_RULES: Array<{ keywords: string[]; department: string; urgency: SymptomAnalysisResult['urgency'] }> = [
  { keywords: ['rash', 'skin', 'itch'], department: 'Dermatology', urgency: 'low' },
  { keywords: ['child', 'baby', 'fever'], department: 'Pediatrics', urgency: 'moderate' },
  { keywords: ['chest', 'breathing', 'shortness'], department: 'Urgent Care', urgency: 'high' },
]

export async function analyzeSymptomText(text: string): Promise<SymptomAnalysisResult> {
  const normalized = text.trim().toLowerCase()
  const match = KEYWORD_RULES.find((rule) => rule.keywords.some((keyword) => normalized.includes(keyword)))

  if (match) {
    return {
      summary: `Recommended department: ${match.department}`,
      recommendedDepartment: match.department,
      urgency: match.urgency,
      guidance: `Based on your symptoms, ${match.department} is the best next step.`,
    }
  }

  return {
    summary: 'Recommended department: Family Medicine',
    recommendedDepartment: 'Family Medicine',
    urgency: 'low',
    guidance: 'A general primary care visit is recommended as the next step.',
  }
}
