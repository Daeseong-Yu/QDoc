import { AuthProvider } from './features/auth/AuthContext'
import { OnboardingProvider } from './features/onboarding/OnboardingContext'
import { AppRouter } from './routes/AppRouter'

function App() {
  return (
    <AuthProvider>
      <OnboardingProvider>
        <AppRouter />
      </OnboardingProvider>
    </AuthProvider>
  )
}

export default App
