import { useNavigate, useLocation, NavLink } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

const NAV_LINKS = [
  { label: 'Dashboard',    to: '/dashboard' },
  { label: 'Calendar',      to: '/appointments' },
  { label: 'Clients',      to: '/clients' },
  { label: 'Staff',        to: '/staff' },
  { label: 'Reports',      to: '/reports' },
  { label: 'Admin',        to: '/admin' },
  { label: 'Ask Noorie',   to: '/ask' },
]

export default function Topbar({ onDashboardClick }: { onDashboardClick?: () => void }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { signOut } = useAuthStore()

  const handleSignOut = () => {
    signOut()
    navigate('/login')
  }

  return (
    <header style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
      height: 52, backgroundColor: '#034325',
      display: 'flex', alignItems: 'center',
      padding: '0 16px', gap: 16,
    }}>
      <p style={{ color: '#ffffff', fontSize: 13, fontWeight: 500, margin: 0, flexShrink: 0, whiteSpace: 'nowrap' }}>
        New Look Beauty Salon
      </p>
      <nav style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, overflowX: 'auto' }}>
        {NAV_LINKS.map(link => {
          const isActive = location.pathname === link.to
          return (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={link.to === '/dashboard' ? onDashboardClick : undefined}
              style={{
                color: isActive ? '#00BF00' : 'rgba(255,255,255,0.6)',
                fontSize: 12, textDecoration: 'none', whiteSpace: 'nowrap',
                fontWeight: isActive ? 600 : 400,
              }}
            >
              {link.label}
            </NavLink>
          )
        })}
      </nav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>BFC</span>
        <button
          onClick={handleSignOut}
          style={{
            background: 'none', border: '1px solid rgba(255,255,255,0.25)',
            color: 'rgba(255,255,255,0.6)', fontSize: 11, borderRadius: 4,
            padding: '3px 8px', cursor: 'pointer',
          }}
        >
          Sign out
        </button>
      </div>
    </header>
  )
}
