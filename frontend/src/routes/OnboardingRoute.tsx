import { Navigate, Outlet } from 'react-router-dom'

import type { OnboardingStep } from '../features/onboarding/OnboardingContext'
import { useOnboarding } from '../features/onboarding/useOnboarding'

type OnboardingRouteProps = {
  requiredStep: OnboardingStep
}

export function OnboardingRoute({ requiredStep }: OnboardingRouteProps) {
  const { canAccessStep, getEntryPath } = useOnboarding()

  if (!canAccessStep(requiredStep)) {
    return <Navigate to={getEntryPath()} replace />
  }

  return <Outlet />
}
