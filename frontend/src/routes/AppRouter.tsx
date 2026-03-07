import { Navigate, Route, Routes } from 'react-router-dom'

import { HomePage } from '../pages/HomePage'
import { HospitalSearchPage } from '../pages/HospitalSearchPage'
import { LoginPage } from '../pages/LoginPage'
import { SymptomPage } from '../pages/SymptomPage'
import { ProtectedRoute } from './ProtectedRoute'

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/hospitals" element={<HospitalSearchPage />} />
        <Route path="/symptoms" element={<SymptomPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
