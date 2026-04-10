import { useState } from 'react'
import { useNavigate, useLocation, NavLink } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

// ── Types ─────────────────────────────────────────────────────────────────────

type DrillDown = null | 'appointments' | 'walkins' | 'completed' | 'toprunner' | 'revenue-today' | 'revenue-week' | 'revenue-month' | 'revenue-year'

// ── Mock data ────────────────────────────────────────────────────────────────

const mockAllAppts = [
  { id: 'a1',  client: 'Priya Sharma',       service: 'Hair Colour',        staff: 'Aisha Malik',  time: '09:00', status: 'completed',   walkIn: false, payment: 180 },
  { id: 'a2',  client: 'Noor Al Rashid',      service: 'Keratin Treatment',  staff: 'Aisha Malik',  time: '10:30', status: 'completed',   walkIn: false, payment: 220 },
  { id: 'a3',  client: 'Fatima Zahra',        service: 'Blowout',            staff: 'Aisha Malik',  time: '12:00', status: 'in_progress', walkIn: true,  payment: 0   },
  { id: 'a4',  client: 'Sarah Johnson',       service: 'Hair Cut',           staff: 'Aisha Malik',  time: '13:30', status: 'scheduled',   walkIn: false, payment: 0   },
  { id: 'a5',  client: 'Meera Patel',         service: 'Manicure + Pedicure',staff: 'Rania Khalid', time: '09:30', status: 'completed',   walkIn: false, payment: 120 },
  { id: 'a6',  client: 'Layla Hassan',        service: 'Gel Nails',          staff: 'Rania Khalid', time: '11:00', status: 'in_progress', walkIn: true,  payment: 0   },
  { id: 'a7',  client: 'Dana Al Farsi',       service: 'Nail Art',           staff: 'Rania Khalid', time: '13:00', status: 'scheduled',   walkIn: false, payment: 0   },
  { id: 'a8',  client: 'Hessa Al Mansoori',   service: 'Facial',             staff: 'Sunita Rao',   time: '10:00', status: 'completed',   walkIn: false, payment: 150 },
  { id: 'a9',  client: 'Amira Qasim',         service: 'Eyebrow Threading',  staff: 'Sunita Rao',   time: '11:30', status: 'scheduled',   walkIn: false, payment: 0   },
  { id: 'a10', client: 'Rina Verma',          service: 'Full Body Wax',      staff: 'Sunita Rao',   time: '13:00', status: 'scheduled',   walkIn: false, payment: 0   },
  { id: 'a11', client: 'Chloe Martin',        service: 'Lash Lift',          staff: 'Sunita Rao',   time: '14:30', status: 'scheduled',   walkIn: false, payment: 0   },
]

const mockStaff = [
  { id: '1', name: 'Aisha Malik',  appointments: mockAllAppts.filter(a => a.staff === 'Aisha Malik') },
  { id: '2', name: 'Rania Khalid', appointments: mockAllAppts.filter(a => a.staff === 'Rania Khalid') },
  { id: '3', name: 'Sunita Rao',   appointments: mockAllAppts.filter(a => a.staff === 'Sunita Rao') },
]

const mockRevenue = { amount: 1240, payments: 7 }
const mockTopRunner = { name: 'Aisha Malik', revenue: 520, appointments: 4 }
const mockApptSummary = { total: 11, completed: 4, walkIns: 2, noShow: 0 }

const mockBirthdays = [
  { id: 'b1', name: 'Priya Sharma', date: 'Apr 11', phone: '+971501234567' },
  { id: 'b2', name: 'Layla Hassan', date: 'Apr 13', phone: '+971507654321' },
  { id: 'b3', name: 'Meera Patel',  date: 'Apr 16', phone: '+971509876543' },
]

const mockRevenueByService = [
  { service: 'Hair Colour', amount: 360 },
  { service: 'Keratin Treatment', amount: 220 },
  { service: 'Manicure + Pedicure', amount: 240 },
  { service: 'Facial', amount: 150 },
  { service: 'Eyebrow Threading', amount: 60 },
  { service: 'Blowout', amount: 210 },
]

const mockRevenueByStaff = [
  { staff: 'Aisha Malik',  amount: 520 },
  { staff: 'Rania Khalid', amount: 420 },
  { staff: 'Sunita Rao',   amount: 300 },
]

const mockWeeklyRevenue = [
  { day: 'Mon', appointments: 8,  revenue: 960,  past: true },
  { day: 'Tue', appointments: 10, revenue: 1150, past: true },
  { day: 'Wed', appointments: 9,  revenue: 1080, past: true },
  { day: 'Thu', appointments: 11, revenue: 1240, past: true },
  { day: 'Fri', appointments: 0,  revenue: 0,    past: false },
  { day: 'Sat', appointments: 0,  revenue: 0,    past: false },
]

const mockMonthlyRevenue = [
  { week: 'Week 1', appointments: 42, revenue: 4980, past: true },
  { week: 'Week 2', appointments: 38, revenue: 4520, past: true },
  { week: 'Week 3', appointments: 45, revenue: 5230, past: true },
  { week: 'Week 4', appointments: 11, revenue: 1240, past: true },
]

const mockYearlyRevenue = [
  { month: 'Jan', appointments: 168, revenue: 19800, past: true },
  { month: 'Feb', appointments: 154, revenue: 18200, past: true },
  { month: 'Mar', appointments: 172, revenue: 20400, past: true },
  { month: 'Apr', appointments: 136, revenue: 15970, past: true },
  { month: 'May', appointments: 0,   revenue: 0,     past: false },
  { month: 'Jun', appointments: 0,   revenue: 0,     past: false },
  { month: 'Jul', appointments: 0,   revenue: 0,     past: false },
  { month: 'Aug', appointments: 0,   revenue: 0,     past: false },
  { month: 'Sep', appointments: 0,   revenue: 0,     past: false },
  { month: 'Oct', appointments: 0,   revenue: 0,     past: false },
  { month: 'Nov', appointments: 0,   revenue: 0,     past: false },
  { month: 'Dec', appointments: 0,   revenue: 0,     past: false },
]

const mockTopRunnerWeek = [
  { day: 'Mon', appointments: 4, revenue: 480 },
  { day: 'Tue', appointments: 5, revenue: 590 },
  { day: 'Wed', appointments: 4, revenue: 460 },
  { day: 'Thu', appointments: 4, revenue: 520 },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

const NAV_LINKS = [
  { label: 'Dashboard',  to: '/dashboard' },
  { label: 'Calendar',   to: '/calendar' },
  { label: 'Clients',    to: '/clients' },
  { label: 'Staff',      to: '/staff' },
  { label: 'Reports',    to: '/reports' },
  { label: 'Admin',      to: '/admin' },
  { label: 'Ask Noorie', to: '/ask' },
]

const DRILLDOWN_LABELS: Record<NonNullable<DrillDown>, string> = {
  'appointments':   'Appointments today',
  'walkins':        'Walk-ins today',
  'completed':      'Completed today',
  'toprunner':      'Top runner today',
  'revenue-today':  'Revenue — today',
  'revenue-week':   'Revenue — this week',
  'revenue-month':  'Revenue — this month',
  'revenue-year':   'Revenue — this year',
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, React.CSSProperties> = {
    completed:   { backgroundColor: '#034325', color: '#ffffff' },
    in_progress: { backgroundColor: '#f0fdf4', color: '#034325', border: '0.5px solid #d1fae5' },
    scheduled:   { backgroundColor: '#f9fafb', color: '#6b7280', border: '0.5px solid #e0e0e0' },
    no_show:     { backgroundColor: '#fee2e2', color: '#991b1b' },
  }
  const labels: Record<string, string> = {
    completed: 'Completed', in_progress: 'In progress', scheduled: 'Scheduled', no_show: 'No show',
  }
  return (
    <span style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 500,
      whiteSpace: 'nowrap', ...(styles[status] ?? { backgroundColor: '#f9fafb', color: '#6b7280' }),
    }}>
      {labels[status] ?? status}
    </span>
  )
}

// ── Table styles ──────────────────────────────────────────────────────────────

const TH: React.CSSProperties = { textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', padding: '6px 10px', borderBottom: '0.5px solid #e0e0e0', whiteSpace: 'nowrap' }
const TD: React.CSSProperties = { fontSize: 12, color: '#000000', padding: '7px 10px', borderBottom: '0.5px solid #f0f0f0', verticalAlign: 'middle' }

// ── Appointment table ─────────────────────────────────────────────────────────

function ApptTable({ rows, showPayment = false }: { rows: typeof mockAllAppts; showPayment?: boolean }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            <th style={TH}>Client</th>
            <th style={TH}>Service</th>
            <th style={TH}>Staff</th>
            <th style={TH}>Time</th>
            <th style={TH}>Status</th>
            {showPayment && <th style={{ ...TH, textAlign: 'right' }}>Payment</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(a => (
            <tr key={a.id}>
              <td style={TD}>{a.client}</td>
              <td style={TD}>{a.service}</td>
              <td style={TD}>{a.staff}</td>
              <td style={TD}>{a.time}</td>
              <td style={TD}><StatusBadge status={a.status} /></td>
              {showPayment && <td style={{ ...TD, textAlign: 'right', fontWeight: 500 }}>AED {a.payment.toFixed(2)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Drill-down panel ──────────────────────────────────────────────────────────

function DrillDownPanel({ drilldown, onBack, onDrilldown }: { drilldown: NonNullable<DrillDown>; onBack: () => void; onDrilldown: (d: DrillDown) => void }) {
  return (
    <div style={{
      backgroundColor: '#ffffff', borderRadius: 8,
      border: '0.5px solid #e0e0e0', padding: 16, margin: '0 16px 16px',
    }}>
      {/* Back + breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: drilldown === 'revenue-today' ? 10 : 16 }}>
        <button
          onClick={onBack}
          style={{
            background: 'transparent', border: '0.5px solid #034325',
            color: '#034325', borderRadius: 6, padding: '4px 12px',
            fontSize: 12, cursor: 'pointer', fontWeight: 500,
          }}
        >
          ← Back
        </button>
        <span style={{ color: '#6b7280', fontSize: 12 }}>
          Dashboard › {DRILLDOWN_LABELS[drilldown]}
        </span>
      </div>

      {/* Revenue period chips */}
      {drilldown === 'revenue-today' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['revenue-week', 'revenue-month', 'revenue-year'] as const).map((key, i) => (
            <span
              key={key}
              onClick={() => onDrilldown(key)}
              style={{
                display: 'inline-flex', alignItems: 'center',
                backgroundColor: '#f9fafb', border: '0.5px solid #034325',
                color: '#034325', borderRadius: 6, padding: '4px 12px',
                fontSize: 12, cursor: 'pointer',
              }}
            >
              {['View this week', 'View this month', 'View this year'][i]}
            </span>
          ))}
        </div>
      )}

      {/* Content */}
      {drilldown === 'appointments' && (
        <ApptTable rows={mockAllAppts} />
      )}

      {drilldown === 'walkins' && (
        <ApptTable rows={mockAllAppts.filter(a => a.walkIn)} />
      )}

      {drilldown === 'completed' && (
        <ApptTable rows={mockAllAppts.filter(a => a.status === 'completed')} showPayment />
      )}

      {drilldown === 'toprunner' && (
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {/* Today's schedule */}
          <div style={{ flex: 1, minWidth: 280 }}>
            <p style={{ color: '#034325', fontSize: 12, fontWeight: 600, margin: '0 0 10px' }}>
              Today's schedule — {mockTopRunner.name}
            </p>
            <ApptTable rows={mockAllAppts.filter(a => a.staff === mockTopRunner.name)} showPayment />
          </div>
          {/* This week's stats */}
          <div style={{ flex: 1, minWidth: 240 }}>
            <p style={{ color: '#034325', fontSize: 12, fontWeight: 600, margin: '0 0 10px' }}>
              This week's stats
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={TH}>Day</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Appts</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {mockTopRunnerWeek.map(row => (
                  <tr key={row.day}>
                    <td style={TD}>{row.day}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{row.appointments}</td>
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 500 }}>AED {row.revenue}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...TD, fontWeight: 700, borderTop: '0.5px solid #e0e0e0' }}>Total</td>
                  <td style={{ ...TD, textAlign: 'right', fontWeight: 700, borderTop: '0.5px solid #e0e0e0' }}>
                    {mockTopRunnerWeek.reduce((s, r) => s + r.appointments, 0)}
                  </td>
                  <td style={{ ...TD, textAlign: 'right', fontWeight: 700, borderTop: '0.5px solid #e0e0e0' }}>
                    AED {mockTopRunnerWeek.reduce((s, r) => s + r.revenue, 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {drilldown === 'revenue-today' && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {/* By service */}
          <div style={{ flex: 1, minWidth: 240, backgroundColor: '#f9fafb', borderRadius: 8, padding: 14 }}>
            <p style={{ color: '#034325', fontSize: 12, fontWeight: 600, margin: '0 0 10px' }}>By service</p>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={TH}>Service</th>
                  <th style={{ ...TH, textAlign: 'right' }}>AED</th>
                </tr>
              </thead>
              <tbody>
                {mockRevenueByService.map(r => (
                  <tr key={r.service}>
                    <td style={TD}>{r.service}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{r.amount.toFixed(2)}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...TD, fontWeight: 700, borderTop: '0.5px solid #e0e0e0' }}>Total</td>
                  <td style={{ ...TD, textAlign: 'right', fontWeight: 700, borderTop: '0.5px solid #e0e0e0' }}>
                    {mockRevenueByService.reduce((s, r) => s + r.amount, 0).toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {/* By technician */}
          <div style={{ flex: 1, minWidth: 240, backgroundColor: '#f9fafb', borderRadius: 8, padding: 14 }}>
            <p style={{ color: '#034325', fontSize: 12, fontWeight: 600, margin: '0 0 10px' }}>By technician</p>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={TH}>Technician</th>
                  <th style={{ ...TH, textAlign: 'right' }}>AED</th>
                </tr>
              </thead>
              <tbody>
                {mockRevenueByStaff.map(r => (
                  <tr key={r.staff}>
                    <td style={TD}>{r.staff}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{r.amount.toFixed(2)}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...TD, fontWeight: 700, borderTop: '0.5px solid #e0e0e0' }}>Total</td>
                  <td style={{ ...TD, textAlign: 'right', fontWeight: 700, borderTop: '0.5px solid #e0e0e0' }}>
                    {mockRevenueByStaff.reduce((s, r) => s + r.amount, 0).toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {drilldown === 'revenue-week' && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={TH}>Day</th>
              <th style={{ ...TH, textAlign: 'right' }}>Appointments</th>
              <th style={{ ...TH, textAlign: 'right' }}>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {mockWeeklyRevenue.map(row => (
              <tr
                key={row.day}
                style={{ cursor: row.past ? 'pointer' : 'default', opacity: row.past ? 1 : 0.4 }}
                onClick={() => row.past && console.log('drill: week day', row.day)}
              >
                <td style={TD}>{row.day}</td>
                <td style={{ ...TD, textAlign: 'right' }}>{row.past ? row.appointments : '—'}</td>
                <td style={{ ...TD, textAlign: 'right', fontWeight: row.past ? 500 : 400 }}>
                  {row.past ? `AED ${row.revenue.toLocaleString()}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {drilldown === 'revenue-month' && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={TH}>Period</th>
              <th style={{ ...TH, textAlign: 'right' }}>Appointments</th>
              <th style={{ ...TH, textAlign: 'right' }}>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {mockMonthlyRevenue.map(row => (
              <tr
                key={row.week}
                style={{ cursor: 'pointer' }}
                onClick={() => console.log('drill: month week', row.week)}
              >
                <td style={TD}>{row.week}</td>
                <td style={{ ...TD, textAlign: 'right' }}>{row.appointments}</td>
                <td style={{ ...TD, textAlign: 'right', fontWeight: 500 }}>AED {row.revenue.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {drilldown === 'revenue-year' && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={TH}>Month</th>
              <th style={{ ...TH, textAlign: 'right' }}>Appointments</th>
              <th style={{ ...TH, textAlign: 'right' }}>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {mockYearlyRevenue.map(row => (
              <tr
                key={row.month}
                style={{ cursor: row.past ? 'pointer' : 'default' }}
                onClick={() => row.past && console.log('drill: year month', row.month)}
              >
                <td style={{ ...TD, color: row.past ? '#000000' : '#9ca3af' }}>{row.month}</td>
                <td style={{ ...TD, textAlign: 'right', color: row.past ? '#000000' : '#9ca3af' }}>
                  {row.past ? row.appointments : '—'}
                </td>
                <td style={{ ...TD, textAlign: 'right', fontWeight: row.past ? 500 : 400, color: row.past ? '#000000' : '#9ca3af' }}>
                  {row.past ? `AED ${row.revenue.toLocaleString()}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── Appointment card ──────────────────────────────────────────────────────────

function ApptCard({ appt }: { appt: typeof mockAllAppts[0] }) {
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', backgroundColor: '#034325',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
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
              target="_blank" rel="noreferrer"
              style={{
                display: 'inline-block', backgroundColor: '#034325', color: '#ffffff',
                fontSize: 10, padding: '3px 8px', borderRadius: 4, textDecoration: 'none',
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
    <div style={{ backgroundColor: '#ffffff', borderRadius: 8, border: '0.5px solid #e0e0e0', padding: '12px 16px', flex: 1 }}>
      <p style={{ color: '#6b7280', fontSize: 11, margin: '0 0 4px' }}>{label}</p>
      <p style={{ color: '#034325', fontSize: 22, fontWeight: 500, margin: '0 0 4px', lineHeight: 1.2 }}>{value}</p>
      <p style={{ color: '#6b7280', fontSize: 11, margin: 0 }}>{sub}</p>
    </div>
  )
}

// ── Clickable value helper ────────────────────────────────────────────────────

function Clickable({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <span
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ cursor: 'pointer', textDecoration: hovered ? 'underline' : 'none' }}
    >
      {children}
    </span>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signOut } = useAuthStore()
  const [drilldown, setDrilldown] = useState<DrillDown>(null)

  const handleSignOut = () => {
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
                onClick={link.to === '/dashboard' ? () => setDrilldown(null) : undefined}
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
          <button onClick={handleSignOut} style={{
            background: 'none', border: '1px solid rgba(255,255,255,0.25)',
            color: 'rgba(255,255,255,0.6)', fontSize: 11, borderRadius: 4,
            padding: '3px 8px', cursor: 'pointer',
          }}>
            Sign out
          </button>
        </div>
      </header>

      {/* ── Content ── */}
      <div style={{ marginTop: 52, flex: 1, display: 'flex', flexDirection: 'column' }}>

        {/* ── Summary strip ── */}
        <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <SummaryCard
            label="Revenue today"
            value={
              <Clickable onClick={() => setDrilldown('revenue-today')}>
                AED {mockRevenue.amount.toLocaleString()}
              </Clickable>
            }
            sub={
              <span style={{ color: '#6b7280', fontSize: 11 }}>
                {mockRevenue.payments} payments collected
              </span>
            }
          />
          <SummaryCard
            label="Top runner today"
            value={
              <Clickable onClick={() => setDrilldown('toprunner')}>
                <span style={{ fontSize: 18 }}>{mockTopRunner.name}</span>
              </Clickable>
            }
            sub={
              <span style={{ color: '#6b7280', fontSize: 11 }}>
                AED {mockTopRunner.revenue} · {mockTopRunner.appointments} appointments
              </span>
            }
          />
          <SummaryCard
            label="Appointments today"
            value={
              <Clickable onClick={() => setDrilldown('appointments')}>
                {mockApptSummary.total}
              </Clickable>
            }
            sub={
              <span style={{ fontSize: 11 }}>
                <Clickable onClick={() => setDrilldown('completed')}>
                  <span style={{ color: '#034325' }}>{mockApptSummary.completed} completed</span>
                </Clickable>
                <span style={{ color: '#6b7280' }}> · </span>
                <Clickable onClick={() => setDrilldown('walkins')}>
                  <span style={{ color: '#034325' }}>{mockApptSummary.walkIns} walk-ins</span>
                </Clickable>
                <span style={{ color: '#6b7280' }}> · {mockApptSummary.noShow} no-show</span>
              </span>
            }
          />
        </div>

        {/* ── Main area — drilldown or default ── */}
        {drilldown !== null ? (
          <DrillDownPanel drilldown={drilldown} onBack={() => setDrilldown(null)} onDrilldown={setDrilldown} />
        ) : (
          <div style={{ flex: 1, padding: '0 16px 16px', display: 'flex', gap: 12, minHeight: 0 }}>
            <div style={{ flex: 1, overflowX: 'auto', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              {mockStaff.map(member => (
                <StaffColumn key={member.id} member={member} />
              ))}
            </div>
            <BirthdaySidebar />
          </div>
        )}
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
