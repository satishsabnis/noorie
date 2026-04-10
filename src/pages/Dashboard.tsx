import { useNavigate, useLocation, NavLink } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

// ── Mock data ────────────────────────────────────────────────────────────────

const mockStaff = [
  {
    id: '1', name: 'Aisha Malik',
    appointments: [
      { id: 'a1', client: 'Priya Sharma', service: 'Hair Colour', time: '09:00', status: 'completed' },
      { id: 'a2', client: 'Noor Al Rashid', service: 'Keratin Treatment', time: '10:30', status: 'completed' },
      { id: 'a3', client: 'Fatima Zahra', service: 'Blowout', time: '12:00', status: 'in_progress' },
      { id: 'a4', client: 'Sarah Johnson', service: 'Hair Cut', time: '13:30', status: 'scheduled' },
    ],
  },
  {
    id: '2', name: 'Rania Khalid',
    appointments: [
      { id: 'a5', client: 'Meera Patel', service: 'Manicure + Pedicure', time: '09:30', status: 'completed' },
      { id: 'a6', client: 'Layla Hassan', service: 'Gel Nails', time: '11:00', status: 'in_progress' },
      { id: 'a7', client: 'Dana Al Farsi', service: 'Nail Art', time: '13:00', status: 'scheduled' },
    ],
  },
  {
    id: '3', name: 'Sunita Rao',
    appointments: [
      { id: 'a8', client: 'Hessa Al Mansoori', service: 'Facial', time: '10:00', status: 'completed' },
      { id: 'a9', client: 'Amira Qasim', service: 'Eyebrow Threading', time: '11:30', status: 'completed' },
      { id: 'a10', client: 'Rina Verma', service: 'Full Body Wax', time: '13:00', status: 'scheduled' },
      { id: 'a11', client: 'Chloe Martin', service: 'Lash Lift', time: '14:30', status: 'scheduled' },
    ],
  },
]

const mockRevenue = { amount: 1240, payments: 7 }
const mockTopRunner = { name: 'Aisha Malik', revenue: 520, appointments: 4 }
const mockApptSummary = { total: 11, completed: 4, walkIns: 2, noShow: 0 }

const mockBirthdays = [
  { id: 'b1', name: 'Priya Sharma', date: 'Apr 11', phone: '+971501234567' },
  { id: 'b2', name: 'Layla Hassan', date: 'Apr 13', phone: '+971507654321' },
  { id: 'b3', name: 'Meera Patel', date: 'Apr 16', phone: '+971509876543' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

const NAV_LINKS = [
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'Calendar', to: '/calendar' },
  { label: 'Clients', to: '/clients' },
  { label: 'Staff', to: '/staff' },
  { label: 'Reports', to: '/reports' },
  { label: 'Admin', to: '/admin' },
  { label: 'Ask Noorie', to: '/ask' },
]

// ── Appointment card ──────────────────────────────────────────────────────────

function ApptCard({ appt }: { appt: typeof mockStaff[0]['appointments'][0] }) {
  if (appt.status === 'completed') {
    return (
      <div style={{ backgroundColor: '#034325', borderRadius: 6, padding: '8px 10px' }}>
        <p style={{ color: '#00BF00', fontSize: 10, margin: '0 0 2px', fontWeight: 500 }}>
          {appt.time} · {appt.service}
        </p>
        <p style={{ color: '#ffffff', fontSize: 12, fontWeight: 500, margin: '0 0 2px' }}>
          {appt.client}
        </p>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, margin: 0 }}>Completed</p>
      </div>
    )
  }

  if (appt.status === 'in_progress') {
    return (
      <div style={{ backgroundColor: '#f0fdf4', border: '0.5px solid #d1fae5', borderRadius: 6, padding: '6px 8px' }}>
        <p style={{ color: '#6b7280', fontSize: 10, margin: '0 0 2px' }}>{appt.time}</p>
        <p style={{ color: '#000000', fontSize: 12, fontWeight: 500, margin: '0 0 2px' }}>{appt.client}</p>
        <p style={{ color: '#034325', fontSize: 10, margin: '0 0 2px' }}>{appt.service}</p>
        <p style={{ color: '#6b7280', fontSize: 10, margin: 0 }}>In progress</p>
      </div>
    )
  }

  return (
    <div style={{ backgroundColor: '#f9fafb', border: '0.5px solid #e0e0e0', borderRadius: 6, padding: '6px 8px' }}>
      <p style={{ color: '#6b7280', fontSize: 10, margin: '0 0 2px' }}>{appt.time}</p>
      <p style={{ color: '#000000', fontSize: 12, fontWeight: 500, margin: '0 0 2px' }}>{appt.client}</p>
      <p style={{ color: '#034325', fontSize: 10, margin: '0 0 2px' }}>{appt.service}</p>
      <p style={{ color: '#6b7280', fontSize: 10, margin: 0 }}>Scheduled</p>
    </div>
  )
}

// ── Staff column ──────────────────────────────────────────────────────────────

function StaffColumn({ member }: { member: typeof mockStaff[0] }) {
  return (
    <div style={{
      minWidth: 160, backgroundColor: '#ffffff',
      border: '0.5px solid #e0e0e0', borderRadius: 8, padding: 12,
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', backgroundColor: '#034325',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <span style={{ color: '#ffffff', fontSize: 12, fontWeight: 600 }}>{initials(member.name)}</span>
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ color: '#000000', fontSize: 13, fontWeight: 500, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {member.name}
          </p>
          <p style={{ color: '#6b7280', fontSize: 10, margin: 0 }}>
            {member.appointments.length} appt{member.appointments.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Appointment cards */}
      {member.appointments.map(appt => (
        <ApptCard key={appt.id} appt={appt} />
      ))}
    </div>
  )
}

// ── Birthday sidebar ──────────────────────────────────────────────────────────

function BirthdaySidebar() {
  return (
    <div style={{
      width: 180, flexShrink: 0, backgroundColor: '#ffffff',
      border: '0.5px solid #e0e0e0', borderRadius: 8, padding: 12,
      alignSelf: 'flex-start',
    }}>
      <p style={{ color: '#034325', fontSize: 12, fontWeight: 500, margin: '0 0 10px' }}>
        Birthdays — next 7 days
      </p>
      {mockBirthdays.map((b, i) => (
        <div key={b.id}>
          <div style={{ paddingBottom: 8 }}>
            <p style={{ color: '#000000', fontSize: 12, fontWeight: 500, margin: '0 0 2px' }}>{b.name}</p>
            <p style={{ color: '#6b7280', fontSize: 10, margin: '0 0 6px' }}>{b.date}</p>
            <a
              href={`https://wa.me/${b.phone.replace('+', '')}`}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-block',
                backgroundColor: '#034325', color: '#ffffff',
                fontSize: 10, padding: '3px 8px', borderRadius: 4,
                textDecoration: 'none',
              }}
            >
              WhatsApp
            </a>
          </div>
          {i < mockBirthdays.length - 1 && (
            <div style={{ borderBottom: '0.5px solid #f0f0f0', marginBottom: 8 }} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Summary card ──────────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub }: { label: string; value: React.ReactNode; sub: React.ReactNode }) {
  return (
    <div style={{
      backgroundColor: '#ffffff', borderRadius: 8,
      border: '0.5px solid #e0e0e0', padding: '12px 16px', flex: 1,
    }}>
      <p style={{ color: '#6b7280', fontSize: 11, margin: '0 0 4px' }}>{label}</p>
      <p style={{ color: '#034325', fontSize: 22, fontWeight: 500, margin: '0 0 4px', lineHeight: 1.2 }}>{value}</p>
      <p style={{ color: '#6b7280', fontSize: 11, margin: 0 }}>{sub}</p>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signOut } = useAuthStore()

  const handleSignOut = async () => {
    signOut()
    navigate('/login')
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', display: 'flex', flexDirection: 'column' }}>

      {/* ── Topbar ── */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        height: 52, backgroundColor: '#034325',
        display: 'flex', alignItems: 'center',
        padding: '0 16px', gap: 16,
      }}>
        {/* Left: salon name */}
        <p style={{ color: '#ffffff', fontSize: 13, fontWeight: 500, margin: 0, flexShrink: 0, whiteSpace: 'nowrap' }}>
          New Look Beauty Salon
        </p>

        {/* Centre: nav */}
        <nav style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, overflowX: 'auto' }}>
          {NAV_LINKS.map(link => {
            const isActive = location.pathname === link.to
            return (
              <NavLink
                key={link.to}
                to={link.to}
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

        {/* Right: BFC + sign out */}
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

      {/* ── Content (offset by topbar) ── */}
      <div style={{ marginTop: 52, flex: 1, display: 'flex', flexDirection: 'column' }}>

        {/* ── Summary strip ── */}
        <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <SummaryCard
            label="Revenue today"
            value={
              <span
                style={{ cursor: 'pointer' }}
                onClick={() => console.log('drill: revenue')}
              >
                AED {mockRevenue.amount.toLocaleString()}
              </span>
            }
            sub={
              <span
                style={{ cursor: 'pointer' }}
                onClick={() => console.log('drill: payments')}
              >
                {mockRevenue.payments} payments collected
              </span>
            }
          />
          <SummaryCard
            label="Top runner today"
            value={
              <span
                style={{ cursor: 'pointer', fontSize: 18 }}
                onClick={() => console.log('drill: top runner')}
              >
                {mockTopRunner.name}
              </span>
            }
            sub={
              <span
                style={{ cursor: 'pointer' }}
                onClick={() => console.log('drill: top runner detail')}
              >
                AED {mockTopRunner.revenue} · {mockTopRunner.appointments} appointments
              </span>
            }
          />
          <SummaryCard
            label="Appointments today"
            value={
              <span
                style={{ cursor: 'pointer' }}
                onClick={() => console.log('drill: appointments')}
              >
                {mockApptSummary.total}
              </span>
            }
            sub={
              <span
                style={{ cursor: 'pointer' }}
                onClick={() => console.log('drill: appt breakdown')}
              >
                {mockApptSummary.completed} completed · {mockApptSummary.walkIns} walk-ins · {mockApptSummary.noShow} no-show
              </span>
            }
          />
        </div>

        {/* ── Main area ── */}
        <div style={{ flex: 1, padding: '0 16px 16px', display: 'flex', gap: 12, minHeight: 0 }}>

          {/* Staff columns — horizontally scrollable */}
          <div style={{ flex: 1, overflowX: 'auto', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            {mockStaff.map(member => (
              <StaffColumn key={member.id} member={member} />
            ))}
          </div>

          {/* Birthday sidebar */}
          <BirthdaySidebar />
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ textAlign: 'center', padding: '10px 0 14px' }}>
        <p style={{ color: '#9ca3af', fontSize: 10, margin: 0 }}>
          Powered by Blue Flute Consulting LLC-FZ
        </p>
      </div>
    </div>
  )
}
