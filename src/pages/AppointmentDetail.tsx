import { useNavigate } from 'react-router-dom'
import Topbar from '../components/Topbar'

export default function AppointmentDetail() {
  const navigate = useNavigate()

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', display: 'flex', flexDirection: 'column' }}>

      <Topbar />

      <div style={{ marginTop: 52, flex: 1, padding: '20px 16px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              background: 'transparent', border: '0.5px solid #034325',
              color: '#034325', borderRadius: 6, padding: '4px 12px',
              fontSize: 12, cursor: 'pointer', fontWeight: 500,
            }}
          >
            ← Back
          </button>
          <span style={{ color: '#6b7280', fontSize: 12 }}>Dashboard › Appointment detail</span>
        </div>

        <p style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', marginTop: 60 }}>
          Appointment detail — coming soon
        </p>
      </div>

      <div style={{ textAlign: 'center', padding: '10px 0 14px' }}>
        <p style={{ color: '#9ca3af', fontSize: 10, margin: 0 }}>
          Powered by Blue Flute Consulting LLC-FZ
        </p>
      </div>

    </div>
  )
}
