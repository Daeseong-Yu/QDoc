import { Inject, Injectable } from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service'

type SymptomAnalysisResult = {
  urgencyLevel: 'low' | 'medium' | 'high'
  recommendedDepartment: string
  recommendation: string
  confidence: number
}

@Injectable()
export class SymptomsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  analyze(symptomText: string): SymptomAnalysisResult {
    const normalized = symptomText.toLowerCase()

    if (
      normalized.includes('chest pain') ||
      normalized.includes('shortness of breath') ||
      normalized.includes('difficulty breathing')
    ) {
      return {
        urgencyLevel: 'high',
        recommendedDepartment: 'Emergency Medicine',
        recommendation: 'Possible emergency symptoms. Visit emergency care immediately.',
        confidence: 0.91,
      }
    }

    if (normalized.includes('rash') || normalized.includes('itch') || normalized.includes('skin')) {
      return {
        urgencyLevel: 'medium',
        recommendedDepartment: 'Dermatology',
        recommendation: 'Skin-related symptoms detected. Dermatology consultation is recommended.',
        confidence: 0.8,
      }
    }

    if (
      normalized.includes('child') ||
      normalized.includes('kid') ||
      normalized.includes('baby') ||
      normalized.includes('pediatric')
    ) {
      return {
        urgencyLevel: 'medium',
        recommendedDepartment: 'Pediatrics',
        recommendation: 'Pediatric visit is recommended for child symptoms.',
        confidence: 0.78,
      }
    }

    if (normalized.includes('ear') || normalized.includes('nose') || normalized.includes('throat')) {
      return {
        urgencyLevel: 'medium',
        recommendedDepartment: 'ENT',
        recommendation: 'ENT department is recommended for ear/nose/throat symptoms.',
        confidence: 0.77,
      }
    }

    if (normalized.includes('fever') || normalized.includes('cough') || normalized.includes('sore throat')) {
      return {
        urgencyLevel: 'medium',
        recommendedDepartment: 'Internal Medicine',
        recommendation: 'Internal medicine visit within today is recommended.',
        confidence: 0.74,
      }
    }

    return {
      urgencyLevel: 'low',
      recommendedDepartment: 'Family Medicine',
      recommendation: 'General consultation is recommended for further triage.',
      confidence: 0.62,
    }
  }

  async saveHistory(input: {
    customerId?: string
    symptomText: string
    urgencyLevel: string
    recommendedDepartment: string
    recommendation: string
    confidence: number
  }) {
    return this.prisma.symptomAnalysisHistory.create({
      data: {
        customerId: input.customerId,
        symptomText: input.symptomText,
        urgencyLevel: input.urgencyLevel,
        recommendedDepartment: input.recommendedDepartment,
        recommendation: input.recommendation,
        confidence: input.confidence,
      },
    })
  }
}

