import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Topbar from '../components/Topbar'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

// ── Types ─────────────────────────────────────────────────────────────────────

type DrillDown = null | 'appointments' | 'walkins' | 'completed' | 'toprunner' | 'revenue-today' | 'revenue-week' | 'revenue-month' | 'revenue-year'

interface ApptService {
  name: string
  staffName: string
  price: number
}

interface ApptFetched {
  id: string
  starts_at: string
  status: string
  is_walk_in: boolean
  clientName: string
  staffName: string
  services: ApptService[]
  totalPrice: number
  totalDue: number
  totalPaid: number
  balance: number
  lastPaymentAt: string | null
}

interface BriefSlot {
  staffName: string
  freeSlots: { from: string; to: string }[]
}

interface BriefLapsedClient {
  name: string
  phone: string
  daysSinceVisit: number
  lastService: string
  totalSpend: number
  birthdayInDays: number | null
}

interface BriefUnpaid {
  clientName: string
  phone: string
  amountOwed: number
  appointmentDate: string
}

// ── Mock data (drilldown panels — unchanged) ──────────────────────────────────

const mockAllAppts = [
  { id: 'a1',  client: 'Priya Sharma',       service: 'Hair Colour',         staff: 'Aisha Malik',  time: '09:00', status: 'completed',   walkIn: false, payment: 180 },
  { id: 'a2',  client: 'Noor Al Rashid',      service: 'Keratin Treatment',   staff: 'Aisha Malik',  time: '10:30', status: 'completed',   walkIn: false, payment: 220 },
  { id: 'a3',  client: 'Fatima Zahra',        service: 'Blowout',             staff: 'Aisha Malik',  time: '12:00', status: 'in_progress', walkIn: true,  payment: 0   },
  { id: 'a4',  client: 'Sarah Johnson',       service: 'Hair Cut',            staff: 'Aisha Malik',  time: '13:30', status: 'scheduled',   walkIn: false, payment: 0   },
  { id: 'a5',  client: 'Meera Patel',         service: 'Manicure + Pedicure', staff: 'Rania Khalid', time: '09:30', status: 'completed',   walkIn: false, payment: 120 },
  { id: 'a6',  client: 'Layla Hassan',        service: 'Gel Nails',           staff: 'Rania Khalid', time: '11:00', status: 'in_progress', walkIn: true,  payment: 0   },
  { id: 'a7',  client: 'Dana Al Farsi',       service: 'Nail Art',            staff: 'Rania Khalid', time: '13:00', status: 'scheduled',   walkIn: false, payment: 0   },
  { id: 'a8',  client: 'Hessa Al Mansoori',   service: 'Facial',              staff: 'Sunita Rao',   time: '10:00', status: 'completed',   walkIn: false, payment: 150 },
  { id: 'a9',  client: 'Amira Qasim',         service: 'Eyebrow Threading',   staff: 'Sunita Rao',   time: '11:30', status: 'scheduled',   walkIn: false, payment: 0   },
  { id: 'a10', client: 'Rina Verma',          service: 'Full Body Wax',       staff: 'Sunita Rao',   time: '13:00', status: 'scheduled',   walkIn: false, payment: 0   },
  { id: 'a11', client: 'Chloe Martin',        service: 'Lash Lift',           staff: 'Sunita Rao',   time: '14:30', status: 'scheduled',   walkIn: false, payment: 0   },
]


const mockBirthdays = [
  { id: 'b1', name: 'Priya Sharma', date: 'Apr 11', phone: '+971501234567' },
  { id: 'b2', name: 'Layla Hassan', date: 'Apr 13', phone: '+971507654321' },
  { id: 'b3', name: 'Meera Patel',  date: 'Apr 16', phone: '+971509876543' },
]

const mockRevenueByService = [
  { service: 'Hair Colour',         amount: 360 },
  { service: 'Keratin Treatment',   amount: 220 },
  { service: 'Manicure + Pedicure', amount: 240 },
  { service: 'Facial',              amount: 150 },
  { service: 'Eyebrow Threading',   amount: 60  },
  { service: 'Blowout',             amount: 210 },
]

const mockRevenueByStaff = [
  { staff: 'Aisha Malik',  amount: 520 },
  { staff: 'Rania Khalid', amount: 420 },
  { staff: 'Sunita Rao',   amount: 300 },
]

const mockWeeklyRevenue = [
  { day: 'Mon', appointments: 8,  revenue: 960,  past: true  },
  { day: 'Tue', appointments: 10, revenue: 1150, past: true  },
  { day: 'Wed', appointments: 9,  revenue: 1080, past: true  },
  { day: 'Thu', appointments: 11, revenue: 1240, past: true  },
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
  { month: 'Jan', appointments: 168, revenue: 19800, past: true  },
  { month: 'Feb', appointments: 154, revenue: 18200, past: true  },
  { month: 'Mar', appointments: 172, revenue: 20400, past: true  },
  { month: 'Apr', appointments: 136, revenue: 15970, past: true  },
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

function todayStr() {
  return new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function fmtDateTime(iso: string) {
  const d = new Date(iso)
  const datePart = d.toLocaleDateString('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short' })
  const timePart = d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hour12: false })
  return `${datePart} · ${timePart}`
}

function dubaiDateTimeLabel(): string {
  const now = new Date()
  const weekday = now.toLocaleDateString('en-GB', { timeZone: 'Asia/Dubai', weekday: 'long' })
  const day     = now.toLocaleDateString('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric' })
  const month   = now.toLocaleDateString('en-GB', { timeZone: 'Asia/Dubai', month: 'short' })
  const year    = now.toLocaleDateString('en-GB', { timeZone: 'Asia/Dubai', year: 'numeric' })
  const time    = now.toLocaleTimeString('en-US', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hour12: true })
  return `${weekday}, ${day} ${month} ${year} · ${time}`
}

function minutesToHHMM(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

function dubaiMinutesFromISO(iso: string): number {
  const d = new Date(iso)
  const s = d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hour12: false })
  const [h, m] = s.split(':').map(Number)
  return h * 60 + m
}

function findFreeSlots(appts: { startMins: number; endMins: number }[]): { from: string; to: string }[] {
  const OPEN = 9 * 60; const CLOSE = 21 * 60; const MIN_GAP = 30
  const sorted = [...appts].sort((a, b) => a.startMins - b.startMins)
  const slots: { from: string; to: string }[] = []
  let cursor = OPEN
  for (const a of sorted) {
    if (a.startMins > cursor) {
      const end = Math.min(a.startMins, CLOSE)
      if (end - cursor >= MIN_GAP) slots.push({ from: minutesToHHMM(cursor), to: minutesToHHMM(end) })
    }
    cursor = Math.max(cursor, a.endMins)
  }
  if (CLOSE - cursor >= MIN_GAP) slots.push({ from: minutesToHHMM(cursor), to: minutesToHHMM(CLOSE) })
  return slots
}

function daysUntilBirthday(dob: string): number | null {
  if (!dob) return null
  const dubai = new Date(Date.now() + 4 * 60 * 60 * 1000)
  const y = dubai.getUTCFullYear(), mo = dubai.getUTCMonth(), d = dubai.getUTCDate()
  const [, mm, dd] = dob.split('-').map(Number)
  let bday = new Date(Date.UTC(y, mm - 1, dd))
  if (bday < new Date(Date.UTC(y, mo, d))) bday = new Date(Date.UTC(y + 1, mm - 1, dd))
  return Math.round((bday.getTime() - new Date(Date.UTC(y, mo, d)).getTime()) / 86_400_000)
}

// ── Drill-down labels ─────────────────────────────────────────────────────────

const DRILLDOWN_LABELS: Record<NonNullable<DrillDown>, string> = {
  'appointments':  'Appointments today',
  'walkins':       'Walk-ins today',
  'completed':     'Completed today',
  'toprunner':     'Top runner today',
  'revenue-today': 'Revenue — today',
  'revenue-week':  'Revenue — this week',
  'revenue-month': 'Revenue — this month',
  'revenue-year':  'Revenue — this year',
}

// ── Table styles ──────────────────────────────────────────────────────────────

const TH: React.CSSProperties = { textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', padding: '6px 10px', borderBottom: '0.5px solid #e0e0e0', whiteSpace: 'nowrap' }
const TD: React.CSSProperties = { fontSize: 12, color: '#000000', padding: '7px 10px', borderBottom: '0.5px solid #f0f0f0', verticalAlign: 'middle' }

// ── Status badge (drilldown tables) ──────────────────────────────────────────

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
    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 500, whiteSpace: 'nowrap', ...(styles[status] ?? { backgroundColor: '#f9fafb', color: '#6b7280' }) }}>
      {labels[status] ?? status}
    </span>
  )
}

// ── Appointment table (drilldown) ─────────────────────────────────────────────

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
    <div style={{ backgroundColor: '#ffffff', borderRadius: 8, border: '0.5px solid #e0e0e0', padding: 16, margin: '0 16px 16px' }}>

      {/* Back + breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: drilldown === 'revenue-today' ? 10 : 16 }}>
        <button
          onClick={onBack}
          style={{ background: 'transparent', border: '0.5px solid #034325', color: '#034325', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}
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
              style={{ display: 'inline-flex', alignItems: 'center', backgroundColor: '#f9fafb', border: '0.5px solid #034325', color: '#034325', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}
            >
              {['View this week', 'View this month', 'View this year'][i]}
            </span>
          ))}
        </div>
      )}

      {drilldown === 'appointments' && <ApptTable rows={mockAllAppts} />}

      {drilldown === 'walkins' && <ApptTable rows={mockAllAppts.filter(a => a.walkIn)} />}

      {drilldown === 'completed' && <ApptTable rows={mockAllAppts.filter(a => a.status === 'completed')} showPayment />}

      {drilldown === 'toprunner' && (
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <p style={{ color: '#034325', fontSize: 12, fontWeight: 600, margin: '0 0 10px' }}>Today's schedule — {mockTopRunner.name}</p>
            <ApptTable rows={mockAllAppts.filter(a => a.staff === mockTopRunner.name)} showPayment />
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <p style={{ color: '#034325', fontSize: 12, fontWeight: 600, margin: '0 0 10px' }}>This week's stats</p>
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
                  <td style={{ ...TD, textAlign: 'right', fontWeight: 700, borderTop: '0.5px solid #e0e0e0' }}>{mockTopRunnerWeek.reduce((s, r) => s + r.appointments, 0)}</td>
                  <td style={{ ...TD, textAlign: 'right', fontWeight: 700, borderTop: '0.5px solid #e0e0e0' }}>AED {mockTopRunnerWeek.reduce((s, r) => s + r.revenue, 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {drilldown === 'revenue-today' && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240, backgroundColor: '#f9fafb', borderRadius: 8, padding: 14 }}>
            <p style={{ color: '#034325', fontSize: 12, fontWeight: 600, margin: '0 0 10px' }}>By service</p>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={TH}>Service</th><th style={{ ...TH, textAlign: 'right' }}>AED</th></tr></thead>
              <tbody>
                {mockRevenueByService.map(r => (
                  <tr key={r.service}>
                    <td style={TD}>{r.service}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{r.amount.toFixed(2)}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...TD, fontWeight: 700, borderTop: '0.5px solid #e0e0e0' }}>Total</td>
                  <td style={{ ...TD, textAlign: 'right', fontWeight: 700, borderTop: '0.5px solid #e0e0e0' }}>{mockRevenueByService.reduce((s, r) => s + r.amount, 0).toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ flex: 1, minWidth: 240, backgroundColor: '#f9fafb', borderRadius: 8, padding: 14 }}>
            <p style={{ color: '#034325', fontSize: 12, fontWeight: 600, margin: '0 0 10px' }}>By technician</p>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={TH}>Technician</th><th style={{ ...TH, textAlign: 'right' }}>AED</th></tr></thead>
              <tbody>
                {mockRevenueByStaff.map(r => (
                  <tr key={r.staff}>
                    <td style={TD}>{r.staff}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{r.amount.toFixed(2)}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...TD, fontWeight: 700, borderTop: '0.5px solid #e0e0e0' }}>Total</td>
                  <td style={{ ...TD, textAlign: 'right', fontWeight: 700, borderTop: '0.5px solid #e0e0e0' }}>{mockRevenueByStaff.reduce((s, r) => s + r.amount, 0).toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {drilldown === 'revenue-week' && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={TH}>Day</th><th style={{ ...TH, textAlign: 'right' }}>Appointments</th><th style={{ ...TH, textAlign: 'right' }}>Revenue</th></tr></thead>
          <tbody>
            {mockWeeklyRevenue.map(row => (
              <tr key={row.day} style={{ opacity: row.past ? 1 : 0.4 }}>
                <td style={TD}>{row.day}</td>
                <td style={{ ...TD, textAlign: 'right' }}>{row.past ? row.appointments : '—'}</td>
                <td style={{ ...TD, textAlign: 'right', fontWeight: row.past ? 500 : 400 }}>{row.past ? `AED ${row.revenue.toLocaleString()}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {drilldown === 'revenue-month' && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={TH}>Period</th><th style={{ ...TH, textAlign: 'right' }}>Appointments</th><th style={{ ...TH, textAlign: 'right' }}>Revenue</th></tr></thead>
          <tbody>
            {mockMonthlyRevenue.map(row => (
              <tr key={row.week}>
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
          <thead><tr><th style={TH}>Month</th><th style={{ ...TH, textAlign: 'right' }}>Appointments</th><th style={{ ...TH, textAlign: 'right' }}>Revenue</th></tr></thead>
          <tbody>
            {mockYearlyRevenue.map(row => (
              <tr key={row.month}>
                <td style={{ ...TD, color: row.past ? '#000000' : '#9ca3af' }}>{row.month}</td>
                <td style={{ ...TD, textAlign: 'right', color: row.past ? '#000000' : '#9ca3af' }}>{row.past ? row.appointments : '—'}</td>
                <td style={{ ...TD, textAlign: 'right', fontWeight: row.past ? 500 : 400, color: row.past ? '#000000' : '#9ca3af' }}>{row.past ? `AED ${row.revenue.toLocaleString()}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

    </div>
  )
}

// ── Summary card ──────────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, action }: { label: string; value: React.ReactNode; sub: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: '#ffffff', borderRadius: 8, border: '0.5px solid #e0e0e0', padding: '12px 16px', flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <p style={{ color: '#6b7280', fontSize: 11, margin: 0 }}>{label}</p>
        {action}
      </div>
      <p style={{ color: '#034325', fontSize: 22, fontWeight: 500, margin: '0 0 4px', lineHeight: 1.2 }}>{value}</p>
      <p style={{ color: '#6b7280', fontSize: 11, margin: 0 }}>{sub}</p>
    </div>
  )
}

// ── Clickable ─────────────────────────────────────────────────────────────────

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

// ── Client card ───────────────────────────────────────────────────────────────

function ClientCard({ appt, onClick }: { appt: ApptFetched; onClick: () => void }) {
  const time = fmtTime(appt.starts_at)

  // Unpaid balance — any appointment with partial payment takes priority over status-based rendering
  if (appt.totalPaid > 0 && appt.balance > 0) {
    return (
      <div onClick={onClick} style={{ border: '1.5px solid #991b1b', borderRadius: 8, overflow: 'hidden', cursor: 'pointer' }}>
        {/* Header */}
        <div style={{ backgroundColor: '#fff5f5', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#111111', fontSize: 13, fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {appt.clientName}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{ color: '#991b1b', fontSize: 11 }}>{time}</span>
            <span style={{ backgroundColor: '#fee2e2', color: '#991b1b', fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10, whiteSpace: 'nowrap' }}>
              Unpaid balance
            </span>
          </div>
        </div>
        {/* Body */}
        <div style={{ backgroundColor: '#ffffff', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {appt.services.map((svc, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 12, color: '#111111' }}>{svc.name}</span>
              <span style={{ fontSize: 12, color: '#6b7280' }}>{svc.staffName}</span>
            </div>
          ))}
          <div style={{ borderTop: '0.5px solid #f0f0f0', paddingTop: 8, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: '#991b1b', fontWeight: 500 }}>Balance</span>
              <span style={{ fontSize: 12, color: '#991b1b', fontWeight: 500 }}>AED {appt.balance.toFixed(2)}</span>
            </div>
            {appt.lastPaymentAt && (
              <span style={{ fontSize: 11, color: '#6b7280' }}>Last payment: {fmtDateTime(appt.lastPaymentAt)}</span>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (appt.status === 'in_progress') {
    return (
      <div onClick={onClick} style={{ border: '1.5px solid #034325', borderRadius: 8, overflow: 'hidden', cursor: 'pointer' }}>
        {/* Header */}
        <div style={{ backgroundColor: '#034325', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#ffffff', fontSize: 13, fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {appt.clientName}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{ color: '#00BF00', fontSize: 11 }}>{time}</span>
            <span style={{ backgroundColor: '#00BF00', color: '#034325', fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10, whiteSpace: 'nowrap' }}>
              In progress
            </span>
          </div>
        </div>
        {/* Body */}
        <div style={{ backgroundColor: '#ffffff', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {appt.services.map((svc, i) => (
            <div key={i} style={{ opacity: i === 0 ? 1 : 0.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: i === 0 ? 4 : 0 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: '#034325' }}>{svc.name}</span>
                <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 8 }}>{svc.staffName} · AED {svc.price}</span>
              </div>
              {i === 0 && (
                <div style={{ height: 3, backgroundColor: '#f0f0f0', borderRadius: 2 }}>
                  <div style={{ height: '100%', width: '65%', backgroundColor: '#00BF00', borderRadius: 2 }} />
                </div>
              )}
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '0.5px solid #f0f0f0', paddingTop: 8, marginTop: 2 }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Total</span>
            <span style={{ fontSize: 12, color: '#034325', fontWeight: 500 }}>AED {appt.totalPrice.toFixed(2)}</span>
          </div>
        </div>
      </div>
    )
  }

  if (appt.status === 'scheduled') {
    return (
      <div onClick={onClick} style={{ border: '0.5px solid #e0e0e0', borderRadius: 8, overflow: 'hidden', cursor: 'pointer' }}>
        {/* Header */}
        <div style={{ backgroundColor: '#f9fafb', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#111111', fontSize: 13, fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {appt.clientName}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{ color: '#6b7280', fontSize: 11 }}>{time}</span>
            <span style={{ backgroundColor: '#f9fafb', color: '#6b7280', fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 10, border: '0.5px solid #e0e0e0', whiteSpace: 'nowrap' }}>
              Scheduled
            </span>
          </div>
        </div>
        {/* Body */}
        <div style={{ backgroundColor: '#ffffff', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {appt.services.map((svc, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 12, color: '#111111' }}>{svc.name}</span>
              <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 8 }}>{svc.staffName} · AED {svc.price}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '0.5px solid #f0f0f0', paddingTop: 8, marginTop: 2 }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Total</span>
            <span style={{ fontSize: 12, color: '#034325', fontWeight: 500 }}>AED {appt.totalPrice.toFixed(2)}</span>
          </div>
        </div>
      </div>
    )
  }

  // completed (fully paid)
  return (
    <div onClick={onClick} style={{ border: '0.5px solid #e0e0e0', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', opacity: 0.65 }}>
      {/* Header */}
      <div style={{ backgroundColor: '#f0fdf4', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#111111', fontSize: 13, fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {appt.clientName}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ color: '#034325', fontSize: 11 }}>{time}</span>
          <span style={{ backgroundColor: '#034325', color: '#ffffff', fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 10, whiteSpace: 'nowrap' }}>
            Completed
          </span>
        </div>
      </div>
      {/* Body */}
      <div style={{ backgroundColor: '#ffffff', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {appt.services.map((svc, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 12, color: '#111111' }}>{svc.name}</span>
            <span style={{ fontSize: 12, color: '#6b7280' }}>{svc.staffName}</span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '0.5px solid #f0f0f0', paddingTop: 8, marginTop: 2 }}>
          <span style={{ fontSize: 12, color: '#6b7280' }}>Paid · Cash/Card</span>
          <span style={{ fontSize: 12, color: '#034325', fontWeight: 500 }}>AED {appt.totalPrice.toFixed(2)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Birthday strip ────────────────────────────────────────────────────────────

function BirthdayStrip() {
  return (
    <div style={{ backgroundColor: '#ffffff', borderRadius: 8, border: '0.5px solid #e0e0e0', padding: '12px 16px', margin: '0 16px 16px' }}>
      <p style={{ fontSize: 11, fontWeight: 500, color: '#034325', margin: '0 0 10px' }}>
        Birthdays — next 7 days
      </p>
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto' }}>
        {mockBirthdays.map(b => (
          <div key={b.id} style={{ minWidth: 140, flexShrink: 0, backgroundColor: '#f9fafb', borderRadius: 8, border: '0.5px solid #e0e0e0', padding: '10px 12px' }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: '#111111', margin: '0 0 2px' }}>{b.name}</p>
            <p style={{ fontSize: 10, color: '#6b7280', margin: 0 }}>{b.date}</p>
            <button
              onClick={() => window.open(`https://wa.me/${b.phone.replace('+', '')}`, '_blank')}
              style={{ backgroundColor: '#034325', color: '#ffffff', fontSize: 10, padding: '3px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', marginTop: 6 }}
            >
              WhatsApp
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Brief query functions ─────────────────────────────────────────────────────

async function fetchBriefSlots(salonId: string): Promise<BriefSlot[]> {
  const today = todayStr()
  const [{ data: staffRows }, { data: apptRows }] = await Promise.all([
    supabase.from('staff').select('id, name').eq('salon_id', salonId),
    supabase.from('appointments')
      .select('staff_id, starts_at, ends_at')
      .eq('salon_id', salonId)
      .gte('starts_at', `${today}T00:00:00+04:00`)
      .lt('starts_at', `${today}T23:59:59+04:00`),
  ])
  if (!staffRows) return []
  const byStaff: Record<string, { startMins: number; endMins: number }[]> = {}
  for (const a of apptRows ?? []) {
    const sid = a.staff_id as string
    if (!byStaff[sid]) byStaff[sid] = []
    byStaff[sid].push({
      startMins: dubaiMinutesFromISO(a.starts_at as string),
      endMins:   dubaiMinutesFromISO(a.ends_at as string),
    })
  }
  return staffRows
    .map(s => ({ staffName: s.name as string, freeSlots: findFreeSlots(byStaff[s.id as string] ?? []) }))
    .filter(s => s.freeSlots.length > 0)
}

async function fetchBriefLapsedClient(salonId: string): Promise<BriefLapsedClient | null> {
  const { data: clientRows } = await supabase
    .from('clients').select('id, name, phone, dob').eq('salon_id', salonId)
  if (!clientRows || clientRows.length === 0) return null
  const clientIds = clientRows.map(c => c.id as string)
  const [{ data: apptRows }, { data: payRows }] = await Promise.all([
    supabase.from('appointments')
      .select('client_id, starts_at, appointment_services ( services ( name ) )')
      .eq('salon_id', salonId).eq('status', 'completed')
      .in('client_id', clientIds).order('starts_at', { ascending: false }),
    supabase.from('payments').select('client_id, amount').in('client_id', clientIds),
  ])
  const lastVisitMap: Record<string, { date: string; service: string }> = {}
  for (const a of apptRows ?? []) {
    const cid = a.client_id as string
    if (lastVisitMap[cid]) continue
    const svcs = (a.appointment_services as { services: { name: string } | null }[]) ?? []
    lastVisitMap[cid] = { date: a.starts_at as string, service: svcs[0]?.services?.name ?? '—' }
  }
  const spendMap: Record<string, number> = {}
  for (const p of payRows ?? []) {
    const cid = p.client_id as string
    spendMap[cid] = (spendMap[cid] ?? 0) + ((p.amount as number) ?? 0)
  }
  const todayMs = new Date(Date.now() + 4 * 60 * 60 * 1000).getTime()
  const lapsed: BriefLapsedClient[] = []
  for (const c of clientRows) {
    const cid = c.id as string
    const last = lastVisitMap[cid]
    if (!last) continue
    const daysSince = Math.floor((todayMs - new Date(last.date).getTime()) / 86_400_000)
    if (daysSince <= 30) continue
    const birthdayInDays = c.dob ? daysUntilBirthday(c.dob as string) : null
    lapsed.push({
      name: c.name as string,
      phone: (c.phone as string) ?? '',
      daysSinceVisit: daysSince,
      lastService: last.service,
      totalSpend: Math.round((spendMap[cid] ?? 0) * 100) / 100,
      birthdayInDays,
    })
  }
  lapsed.sort((a, b) => {
    const aB = a.birthdayInDays !== null && a.birthdayInDays <= 14
    const bB = b.birthdayInDays !== null && b.birthdayInDays <= 14
    if (aB && !bB) return -1
    if (!aB && bB) return 1
    return b.totalSpend - a.totalSpend
  })
  return lapsed[0] ?? null
}

async function fetchBriefUnpaid(salonId: string): Promise<BriefUnpaid[]> {
  const { data: apptRows } = await supabase
    .from('appointments')
    .select('id, starts_at, clients ( name, phone )')
    .eq('salon_id', salonId).eq('status', 'completed')
  if (!apptRows || apptRows.length === 0) return []
  const apptIds = apptRows.map(a => a.id as string)
  const [{ data: svcRows }, { data: payRows }] = await Promise.all([
    supabase.from('appointment_services').select('appointment_id, price').in('appointment_id', apptIds),
    supabase.from('payments').select('appointment_id, amount').in('appointment_id', apptIds),
  ])
  const svcMap: Record<string, number> = {}
  for (const s of svcRows ?? []) {
    const aid = s.appointment_id as string
    svcMap[aid] = (svcMap[aid] ?? 0) + ((s.price as number) ?? 0)
  }
  const payMap: Record<string, number> = {}
  for (const p of payRows ?? []) {
    const aid = p.appointment_id as string
    payMap[aid] = (payMap[aid] ?? 0) + ((p.amount as number) ?? 0)
  }
  const results: BriefUnpaid[] = []
  for (const a of apptRows) {
    const aid = a.id as string
    const balance = Math.round(((svcMap[aid] ?? 0) - (payMap[aid] ?? 0)) * 100) / 100
    if (balance <= 0) continue
    const client = a.clients as { name: string; phone: string | null } | null
    results.push({
      clientName: client?.name ?? 'Client',
      phone: client?.phone ?? '',
      amountOwed: balance,
      appointmentDate: a.starts_at as string,
    })
  }
  results.sort((a, b) => b.amountOwed - a.amountOwed)
  return results.slice(0, 3)
}

// ── Morning Brief component ───────────────────────────────────────────────────

function MorningBrief({
  slots, lapsedClient, unpaid, loading,
  errors,
}: {
  slots: BriefSlot[]
  lapsedClient: BriefLapsedClient | null
  unpaid: BriefUnpaid[]
  loading: boolean
  errors: { slots: boolean; lapsed: boolean; unpaid: boolean }
}) {
  const [dtLabel, setDtLabel] = useState(dubaiDateTimeLabel())
  useEffect(() => {
    const t = setInterval(() => setDtLabel(dubaiDateTimeLabel()), 60_000)
    return () => clearInterval(t)
  }, [])

  const cardBase: React.CSSProperties = {
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8, padding: '12px 14px',
  }
  const skeletonCard: React.CSSProperties = {
    ...cardBase, backgroundColor: 'rgba(255,255,255,0.05)',
  }
  const bodyText = (s: string) => (
    <p style={{ fontSize: 12, color: '#ffffff', margin: 0, lineHeight: 1.6 }}>{s}</p>
  )
  const errText = () => (
    <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>Unable to load — check connection.</p>
  )
  const loadText = () => (
    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', margin: 0 }}>Loading...</p>
  )

  return (
    <div style={{
      backgroundColor: '#034325', borderRadius: 10, padding: '16px 20px',
      margin: '14px 16px', marginBottom: 14,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <p style={{ fontSize: 11, color: '#00BF00', margin: '0 0 3px' }}>{dtLabel}</p>
          <p style={{ fontSize: 16, fontWeight: 500, color: '#ffffff', margin: 0 }}>Morning Brief</p>
        </div>
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', margin: 0, textAlign: 'right', lineHeight: 1.5 }}>
          Powered by<br />Noorie AI
        </p>
      </div>

      {/* Three insight cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Card 1 — Empty slots */}
        <div style={{ ...(loading ? skeletonCard : cardBase), borderLeft: '3px solid #00BF00' }}>
          <p style={{ fontSize: 11, fontWeight: 500, color: '#00BF00', margin: '0 0 6px' }}>Fill today's gaps</p>
          {loading ? loadText()
            : errors.slots ? errText()
            : slots.length === 0
              ? bodyText('All staff fully booked today.')
              : bodyText(slots.map(s => {
                  const first = s.staffName.split(' ')[0]
                  const last = s.freeSlots[s.freeSlots.length - 1]
                  return last.to === '21:00'
                    ? `${first} has nothing after ${last.from}`
                    : `${first} is free ${s.freeSlots[0].from}–${s.freeSlots[0].to}`
                }).join(' · '))
          }
        </div>

        {/* Card 2 — Lapsed client */}
        <div style={{ ...(loading ? skeletonCard : cardBase), borderLeft: '3px solid #C9A227' }}>
          <p style={{ fontSize: 11, fontWeight: 500, color: '#C9A227', margin: '0 0 6px' }}>Client to call today</p>
          {loading ? loadText()
            : errors.lapsed ? errText()
            : !lapsedClient
              ? bodyText('All active clients visited recently.')
              : bodyText(
                  `${lapsedClient.name} — ${lapsedClient.daysSinceVisit} days since last visit · Last booked ${lapsedClient.lastService} · ${lapsedClient.phone}`
                  + (lapsedClient.birthdayInDays !== null && lapsedClient.birthdayInDays <= 14
                      ? ` · Birthday in ${lapsedClient.birthdayInDays} days`
                      : '')
                )
          }
        </div>

        {/* Card 3 — Unpaid balances */}
        <div style={{ ...(loading ? skeletonCard : cardBase), borderLeft: '3px solid rgba(255,255,255,0.3)' }}>
          <p style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.6)', margin: '0 0 6px' }}>Outstanding payments</p>
          {loading ? loadText()
            : errors.unpaid ? errText()
            : unpaid.length === 0
              ? bodyText('No outstanding balances.')
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {unpaid.map((u, i) => (
                    <p key={i} style={{ fontSize: 12, color: '#ffffff', margin: 0, lineHeight: 1.5 }}>
                      {u.clientName} owes AED {u.amountOwed.toFixed(2)} — last visit {fmtDateTime(u.appointmentDate)} · {u.phone}
                    </p>
                  ))}
                </div>
          }
        </div>

      </div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate()
  const staffRecord = useAuthStore(s => s.staffRecord)
  const [drilldown, setDrilldown] = useState<DrillDown>(null)
  const [cards, setCards] = useState<ApptFetched[]>([])
  const [cardsLoading, setCardsLoading] = useState(true)
  const [focusTick, setFocusTick] = useState(0)
  const [summaryRevenue,      setSummaryRevenue]      = useState({ total: 0, paymentsCount: 0 })
  const [summaryAppointments, setSummaryAppointments] = useState({ total: 0, completed: 0, walkIns: 0, noShow: 0 })
  const [summaryTopRunner,    setSummaryTopRunner]    = useState<{ name: string; revenue: number; appointments: number } | null>(null)
  const [briefSlots,          setBriefSlots]          = useState<BriefSlot[]>([])
  const [briefLapsedClient,   setBriefLapsedClient]   = useState<BriefLapsedClient | null>(null)
  const [briefUnpaid,         setBriefUnpaid]         = useState<BriefUnpaid[]>([])
  const [briefLoading,        setBriefLoading]        = useState(true)
  const [briefErrors,         setBriefErrors]         = useState({ slots: false, lapsed: false, unpaid: false })

  // Re-fetch whenever the window regains focus (e.g. navigating back from appointment detail)
  useEffect(() => {
    function onFocus() { setFocusTick(t => t + 1) }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  useEffect(() => {
    let cancelled = false
    let firstLoad = true

    async function fetchCards() {
      const salonId = staffRecord?.salon_id
      if (!salonId) {
        if (!cancelled && firstLoad) { setCardsLoading(false); firstLoad = false }
        return
      }

      const today = todayStr()

      // Query 1: appointments + clients + staff
      const { data: appts, error: apptErr } = await supabase
        .from('appointments')
        .select('id, starts_at, status, is_walk_in, clients ( id, name ), staff ( id, name )')
        .eq('salon_id', salonId)
        .gte('starts_at', `${today}T00:00:00+04:00`)
        .lt('starts_at', `${today}T23:59:59+04:00`)

      console.log('Dashboard fetchCards Q1:', { salonId, today, appts, apptErr })

      if (apptErr || !appts) {
        if (!cancelled && firstLoad) { setCardsLoading(false); firstLoad = false }
        return
      }

      // Derive summary appointments from Q1
      const apptIds = appts.map(a => a.id)
      const summaryAppts = {
        total:     appts.length,
        completed: appts.filter(a => a.status === 'completed').length,
        walkIns:   appts.filter(a => (a.is_walk_in as boolean)).length,
        noShow:    appts.filter(a => a.status === 'no_show').length,
      }

      if (appts.length === 0) {
        if (!cancelled) {
          setCards([])
          setSummaryAppointments(summaryAppts)
          setSummaryRevenue({ total: 0, paymentsCount: 0 })
          setSummaryTopRunner(null)
          if (firstLoad) { setCardsLoading(false); firstLoad = false }
        }
        return
      }

      // Query 2 + 3 in parallel: services and payments
      const [{ data: svcRows, error: svcErr }, { data: payRows }] = await Promise.all([
        supabase
          .from('appointment_services')
          .select('appointment_id, price, services ( name ), staff ( name )')
          .in('appointment_id', apptIds),
        supabase
          .from('payments')
          .select('appointment_id, amount, created_at')
          .in('appointment_id', apptIds)
          .order('created_at', { ascending: false }),
      ])

      console.log('Dashboard fetchCards Q2+Q3:', { svcRows, svcErr, payRows })

      // Build lookup: appointment_id → service list
      const svcMap: Record<string, ApptService[]> = {}
      for (const row of svcRows ?? []) {
        const apptId = row.appointment_id as string
        if (!svcMap[apptId]) svcMap[apptId] = []
        svcMap[apptId].push({
          name:      (row.services as { name: string } | null)?.name ?? '—',
          staffName: (row.staff    as { name: string } | null)?.name ?? '',
          price:     (row.price    as number | null) ?? 0,
        })
      }

      // Merge appointments + services
      const merged = appts.map(a => {
        const services = svcMap[a.id] ?? []
        return {
          id:          a.id as string,
          starts_at:   a.starts_at as string,
          status:      a.status as string,
          is_walk_in:  a.is_walk_in as boolean,
          clientName:  (a.clients as { name: string } | null)?.name ?? 'Client',
          staffName:   (a.staff   as { name: string } | null)?.name ?? '',
          services,
          totalPrice:  services.reduce((s, svc) => s + svc.price, 0),
        }
      })

      // Build payment map
      const payMap: Record<string, { totalPaid: number; lastPaymentAt: string | null }> = {}
      for (const row of payRows ?? []) {
        const aid = row.appointment_id as string
        if (!payMap[aid]) payMap[aid] = { totalPaid: 0, lastPaymentAt: row.created_at as string }
        payMap[aid].totalPaid += (row.amount as number) ?? 0
      }

      const withPayments: ApptFetched[] = merged.map(a => {
        const pay = payMap[a.id] ?? { totalPaid: 0, lastPaymentAt: null }
        const totalDue  = a.totalPrice
        const totalPaid = Math.round(pay.totalPaid * 100) / 100
        const balance   = Math.max(0, Math.round((totalDue - totalPaid) * 100) / 100)
        return { ...a, totalDue, totalPaid, balance, lastPaymentAt: pay.lastPaymentAt }
      })

      // Derive summary revenue from payRows
      const revTotal = Math.round((payRows ?? []).reduce((s, r) => s + ((r.amount as number) ?? 0), 0) * 100) / 100
      const revCount = (payRows ?? []).length

      // Derive top runner: staff with highest revenue from completed appointment services
      const completedIds = new Set(appts.filter(a => a.status === 'completed').map(a => a.id as string))
      const staffRevMap: Record<string, { revenue: number; apptIds: Set<string> }> = {}
      for (const row of svcRows ?? []) {
        const apptId = row.appointment_id as string
        if (!completedIds.has(apptId)) continue
        const staffName = (row.staff as { name: string } | null)?.name ?? ''
        if (!staffName) continue
        if (!staffRevMap[staffName]) staffRevMap[staffName] = { revenue: 0, apptIds: new Set() }
        staffRevMap[staffName].revenue += (row.price as number) ?? 0
        staffRevMap[staffName].apptIds.add(apptId)
      }
      let topRunner: { name: string; revenue: number; appointments: number } | null = null
      for (const [name, data] of Object.entries(staffRevMap)) {
        const rev = Math.round(data.revenue * 100) / 100
        if (!topRunner || rev > topRunner.revenue) {
          topRunner = { name, revenue: rev, appointments: data.apptIds.size }
        }
      }

      console.log('Dashboard setCards:', withPayments)

      if (!cancelled) {
        setCards(withPayments)
        setSummaryAppointments(summaryAppts)
        setSummaryRevenue({ total: revTotal, paymentsCount: revCount })
        setSummaryTopRunner(topRunner)
        if (firstLoad) { setCardsLoading(false); firstLoad = false }
      }
    }

    async function fetchBrief() {
      const salonId = staffRecord?.salon_id
      if (!salonId || cancelled) return
      setBriefLoading(true)
      const [slotsRes, lapsedRes, unpaidRes] = await Promise.all([
        fetchBriefSlots(salonId).then(d => ({ d, e: false })).catch(() => ({ d: [] as BriefSlot[], e: true })),
        fetchBriefLapsedClient(salonId).then(d => ({ d, e: false })).catch(() => ({ d: null as BriefLapsedClient | null, e: true })),
        fetchBriefUnpaid(salonId).then(d => ({ d, e: false })).catch(() => ({ d: [] as BriefUnpaid[], e: true })),
      ])
      if (!cancelled) {
        setBriefSlots(slotsRes.d)
        setBriefLapsedClient(lapsedRes.d)
        setBriefUnpaid(unpaidRes.d)
        setBriefErrors({ slots: slotsRes.e, lapsed: lapsedRes.e, unpaid: unpaidRes.e })
        setBriefLoading(false)
      }
    }

    async function run() {
      await fetchCards()
      await fetchBrief()
    }

    run()
    const interval = setInterval(run, 30_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [staffRecord?.salon_id, focusTick]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sort: unpaid-balance → in_progress → scheduled → completed
  function cardOrder(a: ApptFetched) {
    if (a.totalPaid > 0 && a.balance > 0) return 0
    if (a.status === 'in_progress') return 1
    if (a.status === 'scheduled') return 2
    return 3
  }
  const sortedCards = [...cards].sort((a, b) => {
    const ao = cardOrder(a)
    const bo = cardOrder(b)
    if (ao !== bo) return ao - bo
    return a.starts_at.localeCompare(b.starts_at)
  })

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', display: 'flex', flexDirection: 'column' }}>

      <Topbar onDashboardClick={() => setDrilldown(null)} />

      <div style={{ marginTop: 52, flex: 1, display: 'flex', flexDirection: 'column' }}>

        {/* ── Morning Brief ── */}
        <MorningBrief
          slots={briefSlots}
          lapsedClient={briefLapsedClient}
          unpaid={briefUnpaid}
          loading={briefLoading}
          errors={briefErrors}
        />

        {/* ── Summary strip ── */}
        <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <SummaryCard
            label="Revenue today"
            value={<Clickable onClick={() => setDrilldown('revenue-today')}>AED {summaryRevenue.total.toLocaleString()}</Clickable>}
            sub={<span style={{ color: '#6b7280', fontSize: 11 }}>{summaryRevenue.paymentsCount} payments collected</span>}
          />
          <SummaryCard
            label="Top runner today"
            value={<Clickable onClick={() => setDrilldown('toprunner')}><span style={{ fontSize: 18 }}>{summaryTopRunner?.name ?? '—'}</span></Clickable>}
            sub={<span style={{ color: '#6b7280', fontSize: 11 }}>AED {summaryTopRunner?.revenue ?? 0} · {summaryTopRunner?.appointments ?? 0} appointments</span>}
          />
          <SummaryCard
            label="Appointments today"
            action={
              <button
                onClick={() => navigate('/new-appointment')}
                style={{ backgroundColor: '#034325', color: '#ffffff', fontSize: 11, padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer' }}
              >
                + New
              </button>
            }
            value={<Clickable onClick={() => setDrilldown('appointments')}>{summaryAppointments.total}</Clickable>}
            sub={
              <span style={{ fontSize: 11 }}>
                <Clickable onClick={() => setDrilldown('completed')}><span style={{ color: '#034325' }}>{summaryAppointments.completed} completed</span></Clickable>
                <span style={{ color: '#6b7280' }}> · </span>
                <Clickable onClick={() => setDrilldown('walkins')}><span style={{ color: '#034325' }}>{summaryAppointments.walkIns} walk-ins</span></Clickable>
                <span style={{ color: '#6b7280' }}> · {summaryAppointments.noShow} no-show</span>
              </span>
            }
          />
        </div>

        {/* ── Main area ── */}
        {drilldown !== null ? (
          <DrillDownPanel drilldown={drilldown} onBack={() => setDrilldown(null)} onDrilldown={setDrilldown} />
        ) : (
          <>
            {/* Card grid */}
            <div style={{ padding: '0 16px 16px' }}>
              {cardsLoading ? (
                <p style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', padding: '32px 0' }}>Loading…</p>
              ) : sortedCards.length === 0 ? (
                <p style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', padding: '32px 0' }}>No appointments today.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
                  {sortedCards.map(appt => (
                    <ClientCard
                      key={appt.id}
                      appt={appt}
                      onClick={() => navigate(`/appointment/${appt.id}`)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Birthday strip */}
            <BirthdayStrip />
          </>
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
