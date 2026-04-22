import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import Login from './pages/Login'
import SetPassword from './pages/SetPassword'
import Dashboard from './pages/Dashboard'
import Appointments from './pages/Appointments'
import NewAppointment from './pages/NewAppointment'
import AppointmentDetail from './pages/AppointmentDetail'
import Clients from './pages/Clients'
import ClientProfile from './pages/ClientProfile'
import Staff from './pages/Staff'
import StaffForm from './pages/StaffForm'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function OwnerRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, staffRecord } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  const role = staffRecord?.role
  if (role !== 'owner' && role !== 'supervisor') return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function AppRoutes() {
  const { isLoading, initialize } = useAuthStore()

  useEffect(() => {
    initialize()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' }}>
        <p style={{ color: '#034325', fontSize: 13, fontWeight: 500 }}>Loading…</p>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/set-password" element={<SetPassword />} />
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      } />
      <Route path="/appointments" element={
        <ProtectedRoute>
          <Appointments />
        </ProtectedRoute>
      } />
      <Route path="/new-appointment" element={
        <ProtectedRoute>
          <NewAppointment />
        </ProtectedRoute>
      } />
      <Route path="/appointment/:id" element={
        <ProtectedRoute>
          <AppointmentDetail />
        </ProtectedRoute>
      } />
      <Route path="/clients" element={
        <ProtectedRoute>
          <Clients />
        </ProtectedRoute>
      } />
      <Route path="/client/:id" element={
        <ProtectedRoute>
          <ClientProfile />
        </ProtectedRoute>
      } />
      <Route path="/staff" element={
        <ProtectedRoute>
          <Staff />
        </ProtectedRoute>
      } />
      <Route path="/staff/new" element={
        <OwnerRoute>
          <StaffForm />
        </OwnerRoute>
      } />
      <Route path="/staff/:id" element={
        <OwnerRoute>
          <StaffForm />
        </OwnerRoute>
      } />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
