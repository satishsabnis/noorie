import { useNavigate } from 'react-router-dom'
import Topbar from '../components/Topbar'

export default function Staff() {
  const navigate = useNavigate()

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', display: 'flex', flexDirection: 'column' }}>
      <Topbar />
      <div style={{ marginTop: 52, flex: 1, padding: '20px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              background: 'none', border: '0.5px solid #034325',
              color: '#034325', borderRadius: 6, padding: '4px 12px',
              fontSize: 12, cursor: 'pointer', fontWeight: 500,
            }}
          >
            ← Back
          </button>
          <span style={{ fontSize: 12, color: '#6b7280' }}>Dashboard › Staff</span>
        </div>
        <p style={{ fontSize: 16, fontWeight: 600, color: '#000000', margin: '0 0 8px' }}>Staff</p>
        <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Coming soon.</p>
      </div>
    </div>
  )
}
