import { createContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { useAuth } from '../auth/useAuth'

const ONBOARDING_KEY = 'qdoc.onboarding.state'

export type OnboardingStep = 'family' | 'symptoms' | 'hospitals' | 'queue'

type OnboardingState = {
  ownerUserId: string
  target: 'self'
  symptomText: string
  recommendedDepartment: string
  selectedHospitalId: string
  completed: {
    family: boolean
    symptoms: boolean
    hospitals: boolean
  }
}

type OnboardingSessionContract = {
  target: 'self'
  symptomText: string
  recommendedDepartment: string
  selectedHospitalId: string
}

type CompleteSymptomInput = {
  symptomText: string
  recommendedDepartment: string
}

type OnboardingContextValue = {
  contract: OnboardingSessionContract
  completeFamilyStep: () => void
  completeSymptomStep: (input: CompleteSymptomInput) => void
  completeHospitalStep: (hospitalId: string) => void
  canAccessStep: (step: OnboardingStep) => boolean
  getEntryPath: () => string
  resetOnboarding: () => void
}

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined)

function createDefaultState(ownerUserId: string): OnboardingState {
  return {
    ownerUserId,
    target: 'self',
    symptomText: '',
    recommendedDepartment: '',
    selectedHospitalId: '',
    completed: {
      family: false,
      symptoms: false,
      hospitals: false,
    },
  }
}

function getStorage() {
  if (typeof window === 'undefined') {
    return null
  }

  return window.sessionStorage
}

function loadState(ownerUserId: string): OnboardingState {
  const storage = getStorage()
  if (!storage) {
    return createDefaultState(ownerUserId)
  }

  const raw = storage.getItem(ONBOARDING_KEY)
  if (!raw) {
    return createDefaultState(ownerUserId)
  }

  try {
    const parsed = JSON.parse(raw) as OnboardingState

    if (parsed.ownerUserId !== ownerUserId) {
      return createDefaultState(ownerUserId)
    }

    return {
      ...parsed,
      target: 'self',
      symptomText: parsed.symptomText ?? '',
      recommendedDepartment: parsed.recommendedDepartment ?? '',
      selectedHospitalId: parsed.selectedHospitalId ?? '',
      completed: {
        family: Boolean(parsed.completed?.family),
        symptoms: Boolean(parsed.completed?.symptoms),
        hospitals: Boolean(parsed.completed?.hospitals),
      },
    }
  } catch {
    storage.removeItem(ONBOARDING_KEY)
    return createDefaultState(ownerUserId)
  }
}

function saveState(state: OnboardingState | null) {
  const storage = getStorage()
  if (!storage) {
    return
  }

  if (!state) {
    storage.removeItem(ONBOARDING_KEY)
    return
  }

  storage.setItem(ONBOARDING_KEY, JSON.stringify(state))
}

type OnboardingProviderProps = {
  children: ReactNode
}

export function OnboardingProvider({ children }: OnboardingProviderProps) {
  const { isAuthenticated, session } = useAuth()
  const ownerUserId = session?.user.id ?? null

  const [state, setState] = useState<OnboardingState | null>(null)

  useEffect(() => {
    if (!isAuthenticated || !ownerUserId) {
      setState(null)
      saveState(null)
      return
    }

    setState(loadState(ownerUserId))
  }, [isAuthenticated, ownerUserId])

  useEffect(() => {
    if (!state) {
      return
    }

    saveState(state)
  }, [state])

  const value = useMemo<OnboardingContextValue>(() => {
    const contract: OnboardingSessionContract = {
      target: 'self',
      symptomText: state?.symptomText ?? '',
      recommendedDepartment: state?.recommendedDepartment ?? '',
      selectedHospitalId: state?.selectedHospitalId ?? '',
    }

    const canAccessStep = (step: OnboardingStep) => {
      if (!state) {
        return false
      }

      if (step === 'family') {
        return true
      }

      if (step === 'symptoms') {
        return state.completed.family
      }

      if (step === 'hospitals') {
        return state.completed.family && state.completed.symptoms
      }

      return state.completed.family && state.completed.symptoms && state.completed.hospitals
    }

    const getEntryPath = () => {
      if (!state || !state.completed.family) {
        return '/family'
      }

      if (!state.completed.symptoms) {
        return '/symptoms'
      }

      if (!state.completed.hospitals) {
        return '/hospitals'
      }

      return '/queue'
    }

    const completeFamilyStep = () => {
      setState((current) => {
        if (!current) {
          return current
        }

        return {
          ...current,
          target: 'self',
          completed: {
            ...current.completed,
            family: true,
          },
        }
      })
    }

    const completeSymptomStep = (input: CompleteSymptomInput) => {
      setState((current) => {
        if (!current) {
          return current
        }

        return {
          ...current,
          symptomText: input.symptomText,
          recommendedDepartment: input.recommendedDepartment,
          selectedHospitalId: '',
          completed: {
            ...current.completed,
            symptoms: true,
            hospitals: false,
          },
        }
      })
    }

    const completeHospitalStep = (hospitalId: string) => {
      setState((current) => {
        if (!current) {
          return current
        }

        return {
          ...current,
          selectedHospitalId: hospitalId,
          completed: {
            ...current.completed,
            hospitals: true,
          },
        }
      })
    }

    const resetOnboarding = () => {
      setState((current) => {
        if (!current) {
          return current
        }

        return createDefaultState(current.ownerUserId)
      })
    }

    return {
      contract,
      completeFamilyStep,
      completeSymptomStep,
      completeHospitalStep,
      canAccessStep,
      getEntryPath,
      resetOnboarding,
    }
  }, [state])

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>
}

export { OnboardingContext }
