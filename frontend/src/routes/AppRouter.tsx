import { Navigate, Route, Routes } from 'react-router-dom'

import { FamilyPage } from '../pages/FamilyPage'
import { HomePage } from '../pages/HomePage'
import { HospitalSearchPage } from '../pages/HospitalSearchPage'
import { LoginPage } from '../pages/LoginPage'
import { PatientSelectPage } from '../pages/PatientSelectPage'
import { QueuePage } from '../pages/QueuePage'
import { RoomSelectPage } from '../pages/RoomSelectPage'
import { SymptomPage } from '../pages/SymptomPage'
import { ProtectedRoute } from './ProtectedRoute'

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/family" element={<FamilyPage />} />
        <Route path="/hospitals" element={<HospitalSearchPage />} />
        <Route path="/symptoms" element={<SymptomPage />} />
        <Route path="/queue/patient" element={<PatientSelectPage />} />
        <Route path="/queue/room" element={<RoomSelectPage />} />
        <Route path="/queue/status" element={<QueuePage />} />
        <Route path="/queue" element={<Navigate to="/hospitals" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
