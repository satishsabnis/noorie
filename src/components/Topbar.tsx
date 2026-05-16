import { useState, useEffect } from 'react'
import { useNavigate, useLocation, NavLink } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { supabase } from '../lib/supabase'

const NAV_LINKS = [
  { label: 'Dashboard',    to: '/dashboard' },
  { label: 'Appointments', to: '/appointments' },
  { label: 'Clients',      to: '/clients' },
  { label: 'Staff',        to: '/staff' },
  { label: 'Reports',      to: '/reports' },
  { label: 'Admin',        to: '/admin'  },
  { label: 'Ask Noorie',   to: '/ask' },
]

function MenuItem({ label, color = '#1a1a1a', onClick }: { label: string; color?: string; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%', textAlign: 'left',
        background: hovered ? '#f5f5f5' : 'none',
        border: 'none', fontSize: 13, color,
        padding: '10px 16px', cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}

export default function Topbar({ onDashboardClick }: { onDashboardClick?: () => void }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { signOut, staffRecord, salonName, setSalonName } = useAuthStore()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const salonId = staffRecord?.salon_id
    if (!salonId) return
    if (salonName) return
    supabase.from('salons').select('name').eq('id', salonId).single().then(({ data }) => {
      if (data?.name) setSalonName(data.name as string)
    })
  }, [staffRecord?.salon_id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      const menu = document.getElementById('topbar-menu')
      if (menu && !menu.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

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
      {salonName && (
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => setMenuOpen(prev => !prev)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              color: '#ffffff', fontSize: 13, fontWeight: 500,
              padding: 0, whiteSpace: 'nowrap',
            }}
          >
            {salonName}
            <svg
              width="12" height="12" viewBox="0 0 12 12"
              style={{ transform: menuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
            >
              <path d="M3 4.5L6 7.5L9 4.5" stroke="#ffffff" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {menuOpen && (
            <div
              id="topbar-menu"
              style={{
                position: 'absolute', top: 40, left: 0, zIndex: 200,
                backgroundColor: '#ffffff', border: '0.5px solid #e0e0e0',
                borderRadius: 8, minWidth: 200,
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
              }}
            >
              <MenuItem label="About Noorie"       onClick={() => setMenuOpen(false)} />
              <MenuItem label="Privacy Disclaimer" onClick={() => setMenuOpen(false)} />
              <div style={{ height: 0.5, background: '#e0e0e0', margin: '4px 0' }} />
              <MenuItem
                label="Sign out"
                color="#991b1b"
                onClick={() => { setMenuOpen(false); handleSignOut() }}
              />
            </div>
          )}
        </div>
      )}
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
      {salonName && (
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          backgroundColor: 'rgba(255,255,255,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#ffffff' }}>
            {salonName.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()}
          </span>
        </div>
      )}
    </header>
  )
}
