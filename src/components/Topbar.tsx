import { useState, useEffect } from 'react'
import { useNavigate, useLocation, NavLink } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { supabase } from '../lib/supabase'
import blueFlutelogo from '../assets/logo.png'
import { useIsMobile } from '../hooks/useIsMobile'

const NOORIE_VERSION = 'v2.05.21'

const NAV_LINKS = [
  { label: 'Dashboard',    to: '/dashboard' },
  { label: 'Appointments', to: '/appointments' },
  { label: 'Clients',      to: '/clients' },
  { label: 'Staff',        to: '/staff' },
  { label: 'Reports',      to: '/reports' },
  { label: 'Admin',        to: '/admin'  },
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
  const isMobile = useIsMobile()
  const [menuOpen, setMenuOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [showPrivacy, setShowPrivacy] = useState(false)

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
    <>
    <header style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
      height: 52, backgroundColor: '#034325',
      display: 'flex', alignItems: 'center',
      padding: '0 16px', gap: 16,
    }}>
      {salonName && (
        <div style={{ position: 'relative', flexShrink: 0, ...(isMobile ? { maxWidth: 150 } : {}) }}>
          <button
            onClick={() => setMenuOpen(prev => !prev)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              color: '#ffffff', fontSize: 18, fontWeight: 700,
              padding: 0, minWidth: 0,
            }}
          >
            <span style={isMobile ? {
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
            } : { whiteSpace: 'nowrap' }}>
              {salonName}
            </span>
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
              <MenuItem label="About Noorie"       onClick={() => { setMenuOpen(false); setShowAbout(true) }} />
              <MenuItem label="Privacy Disclaimer" onClick={() => { setMenuOpen(false); setShowPrivacy(true) }} />
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
      {!isMobile && (
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
      )}

      {isMobile && <div style={{ flex: 1 }} />}

      <div style={{
        backgroundColor: '#ffffff', borderRadius: 6,
        padding: '4px 8px', height: 36,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <img
          src={blueFlutelogo}
          alt="Blue Flute"
          style={{ height: 28, width: 'auto', objectFit: 'contain' }}
        />
      </div>

      {isMobile && (
        <button
          onClick={() => setNavOpen(prev => !prev)}
          aria-label="Open navigation"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            width: 44, height: 44, flexShrink: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 4, padding: 0,
          }}
        >
          <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden="true">
            <rect x="0" y="0"  width="18" height="2" rx="1" fill="#ffffff" />
            <rect x="0" y="6"  width="18" height="2" rx="1" fill="#ffffff" />
            <rect x="0" y="12" width="18" height="2" rx="1" fill="#ffffff" />
          </svg>
        </button>
      )}
    </header>

    {isMobile && navOpen && (
      <>
        <div
          onClick={() => setNavOpen(false)}
          style={{
            position: 'fixed', top: 52, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 90,
          }}
        />
        <div style={{
          position: 'fixed', top: 52, right: 0, width: 200, zIndex: 100,
          backgroundColor: '#ffffff', borderLeft: '0.5px solid #e0e0e0', borderBottom: '0.5px solid #e0e0e0',
        }}>
          {NAV_LINKS.map((link, i) => {
            const isActive = location.pathname === link.to
            return (
              <NavLink
                key={link.to}
                to={link.to}
                onClick={() => { setNavOpen(false); if (link.to === '/dashboard') onDashboardClick?.() }}
                style={{
                  display: 'block', width: '100%', boxSizing: 'border-box',
                  padding: '14px 16px', minHeight: 44,
                  fontSize: 15, textDecoration: 'none',
                  color: isActive ? '#00BF00' : '#034325',
                  fontWeight: isActive ? 600 : 400,
                  borderBottom: i < NAV_LINKS.length - 1 ? '0.5px solid #e0e0e0' : 'none',
                  backgroundColor: '#ffffff',
                }}
              >
                {link.label}
              </NavLink>
            )
          })}
        </div>
      </>
    )}

    {showAbout && (
      <div
        onClick={() => setShowAbout(false)}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 300,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            backgroundColor: '#ffffff', borderRadius: 12,
            maxWidth: 420, width: '90%', padding: 24,
            maxHeight: '60vh', overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#034325' }}>About Noorie <span style={{ fontSize: 12, fontWeight: 400, color: '#034325' }}>({NOORIE_VERSION})</span></p>
            <button
              onClick={() => setShowAbout(false)}
              style={{
                background: 'none', border: '0.5px solid #034325',
                color: '#034325', borderRadius: 6,
                padding: '4px 12px', fontSize: 13, cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
          <p style={{ margin: '0 0 12px', fontSize: 14, color: '#133257', lineHeight: 1.5 }}>
            Noorie is an AI powered salon operating system built for Salon owners. It runs your full operation: appointments, clients, staff, payments, payroll, expenses, and layers an intelligence brain on top that reads your data every day to tell you what is happening in your business and what to do next.
          </p>
          <p style={{ margin: '0 0 12px', fontSize: 14, color: '#133257', lineHeight: 1.5 }}>
            Staff has their appointments on their phones. A client booking app, where clients can book directly with their preferred technician, is coming soon.
          </p>
          <p style={{ margin: 0, fontSize: 14, color: '#133257', lineHeight: 1.5 }}>
            Built by Blue Flute Consulting LLC-FZ, Dubai.
          </p>
        </div>
      </div>
    )}

    {showPrivacy && (
      <div
        onClick={() => setShowPrivacy(false)}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 300,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            backgroundColor: '#ffffff', borderRadius: 12,
            maxWidth: 420, width: '90%', padding: 24,
            maxHeight: '60vh', overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#034325' }}>Privacy Disclaimer</p>
            <button
              onClick={() => setShowPrivacy(false)}
              style={{
                background: 'none', border: '0.5px solid #034325',
                color: '#034325', borderRadius: 6,
                padding: '4px 12px', fontSize: 13, cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
          <p style={{ margin: '0 0 12px', fontSize: 14, color: '#133257', lineHeight: 1.5 }}>
            Noorie stores all your salon data in a secure Supabase database hosted in the Asia Pacific region. Every salon's data is isolated at the database level. Your salon's records are never visible to any other salon using Noorie.
          </p>
          <p style={{ margin: '0 0 12px', fontSize: 14, color: '#133257', lineHeight: 1.5 }}>
            Noorie uses Anthropic's Claude AI to generate insights from your data. When you ask the AI a question or load the Morning Brief, the relevant salon data is sent to Anthropic for processing. Anthropic does not use this data to train its models. Every AI query is logged with a timestamp and salon ID for audit purposes.
          </p>
          <p style={{ margin: '0 0 12px', fontSize: 14, color: '#133257', lineHeight: 1.5 }}>
            Noorie operates on three third party services: Supabase (database and authentication), Anthropic (AI processing), and Vercel (web hosting). No data is shared with any party outside these services.
          </p>
          <p style={{ margin: 0, fontSize: 14, color: '#133257', lineHeight: 1.5 }}>
            You own your salon data. You can request a full export or permanent deletion at any time by writing to info@bluefluteconsulting.com.
          </p>
        </div>
      </div>
    )}
    </>
  )
}
