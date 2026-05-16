import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Topbar from '../components/Topbar'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import MarketPulse from '../components/MarketPulse'

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
  clientId: string
}

interface BriefTopClient {
  name: string
  visits: number
  spend: number
  lastVisit: string
  phone: string | null
  ytdSpend: number
}

interface BriefUnpaid {
  clientName: string
  phone: string
  amountOwed: number
  appointmentDate: string
}


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

interface ApptRow {
  client: string;
  service: string;
  staff: string;
  time: string;
  status: string;
  walkIn: boolean;
  payment: number;
}

function cardsToRows(cards: ApptFetched[]): ApptRow[] {
  return cards.map(card => ({
    client:  card.clientName,
    service: card.services.map(s => s.name).join(', '),
    staff:   card.staffName ?? 'Multiple staff',
    time:    new Date(card.starts_at).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' }),
    status:  card.status,
    walkIn:  card.is_walk_in,
    payment: card.totalPaid,
  }))
}

function ApptTable({ rows, showPayment = false }: { rows: ApptRow[]; showPayment?: boolean }) {
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
          {rows.map((a, i) => (
            <tr key={i}>
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

function DrillDownPanel({ drilldown, onBack, onDrilldown, cards, revenueByService, revenueByStaff, weeklyRevenue, monthlyRevenue, yearlyRevenue, topRunnerName, topRunnerAppointmentIds, topRunnerWeek, summaryAppointments }: { drilldown: NonNullable<DrillDown>; onBack: () => void; onDrilldown: (d: Exclude<DrillDown, null>) => void; cards: ApptFetched[]; revenueByService: { service: string; amount: number }[]; revenueByStaff: { staff: string; amount: number }[]; weeklyRevenue: { day: string; appointments: number; revenue: number; past: boolean }[]; monthlyRevenue: { period: string; appointments: number; revenue: number; past: boolean }[]; yearlyRevenue: { month: string; appointments: number; revenue: number; past: boolean }[]; topRunnerName: string | null; topRunnerAppointmentIds: string[]; topRunnerWeek: { day: string; appointments: number; revenue: number; past: boolean }[]; summaryAppointments: { total: number; completed: number; walkIns: number; noShow: number } }) {
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

      {drilldown === 'appointments' && (() => {
        const rows = cardsToRows(cards)
        return (
          <>
            <p style={{ fontSize: 18, fontWeight: 700, color: '#034325', margin: '0 0 16px' }}>
              Total appointments today: {summaryAppointments.total.toLocaleString()}
            </p>
            {rows.length === 0
              ? <p style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic', margin: 0 }}>No appointments today</p>
              : <ApptTable rows={rows} />}
          </>
        )
      })()}

      {drilldown === 'walkins' && (() => {
        const rows = cardsToRows(cards.filter(c => c.is_walk_in))
        return (
          <>
            <p style={{ fontSize: 18, fontWeight: 700, color: '#034325', margin: '0 0 16px' }}>
              Total walk-ins today: {summaryAppointments.walkIns.toLocaleString()}
            </p>
            {rows.length === 0
              ? <p style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic', margin: 0 }}>No walk-ins today</p>
              : <ApptTable rows={rows} />}
          </>
        )
      })()}

      {drilldown === 'completed' && (() => {
        const rows = cardsToRows(cards.filter(c => c.status === 'completed'))
        return (
          <>
            <p style={{ fontSize: 18, fontWeight: 700, color: '#034325', margin: '0 0 16px' }}>
              Total completed today: {summaryAppointments.completed.toLocaleString()}
            </p>
            {rows.length === 0
              ? <p style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic', margin: 0 }}>No completed appointments today</p>
              : <ApptTable rows={rows} showPayment />}
          </>
        )
      })()}

      {drilldown === 'toprunner' && (() => {
        const tpAppts = cards.filter(c => topRunnerAppointmentIds.includes(c.id))
        const tpRows  = cardsToRows(tpAppts)
        const wkAppts = topRunnerWeek.reduce((s, r) => s + r.appointments, 0)
        const wkRev   = topRunnerWeek.reduce((s, r) => s + r.revenue, 0)
        return (
          <>
            <p style={{ fontSize: 18, fontWeight: 700, color: '#034325', margin: '0 0 16px' }}>
              Total this week: AED {wkRev.toLocaleString()}
            </p>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 280 }}>
                <p style={{ color: '#034325', fontSize: 12, fontWeight: 600, margin: '0 0 10px' }}>
                  {topRunnerName ?? '—'}'s appointments today
                </p>
                {tpRows.length === 0
                  ? <p style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic', margin: 0 }}>No appointments today</p>
                  : <ApptTable rows={tpRows} showPayment />}
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
                    {topRunnerWeek.map(row => {
                      const hasRev = row.revenue > 0
                      return (
                        <tr key={row.day} style={{ opacity: row.past ? 1 : 0.4 }}>
                          <td style={TD}>{row.day}</td>
                          <td style={{ ...TD, textAlign: 'right' }}>{hasRev ? row.appointments : '—'}</td>
                          <td style={{ ...TD, textAlign: 'right', fontWeight: hasRev ? 500 : 400 }}>{hasRev ? `AED ${row.revenue.toLocaleString()}` : '—'}</td>
                        </tr>
                      )
                    })}
                    <tr>
                      <td style={{ ...TD, fontWeight: 700, borderTop: '0.5px solid #e0e0e0' }}>Total</td>
                      <td style={{ ...TD, textAlign: 'right', fontWeight: 700, borderTop: '0.5px solid #e0e0e0' }}>{wkAppts}</td>
                      <td style={{ ...TD, textAlign: 'right', fontWeight: 700, borderTop: '0.5px solid #e0e0e0' }}>AED {wkRev.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )
      })()}

      {drilldown === 'revenue-today' && (
        <>
          <p style={{ fontSize: 18, fontWeight: 700, color: '#034325', margin: '0 0 16px' }}>
            Total today: AED {revenueByStaff.reduce((s, r) => s + r.amount, 0).toLocaleString()}
          </p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240, backgroundColor: '#f9fafb', borderRadius: 8, padding: 14 }}>
            <p style={{ color: '#034325', fontSize: 12, fontWeight: 600, margin: '0 0 10px' }}>By service</p>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={TH}>Service</th><th style={{ ...TH, textAlign: 'right' }}>AED</th></tr></thead>
              <tbody>
                {revenueByService.length === 0 ? (
                  <tr>
                    <td style={{ ...TD, color: '#6b7280', fontStyle: 'italic' }} colSpan={2}>No revenue today</td>
                  </tr>
                ) : (
                  <>
                    {revenueByService.map(r => (
                      <tr key={r.service}>
                        <td style={TD}>{r.service}</td>
                        <td style={{ ...TD, textAlign: 'right' }}>{r.amount.toFixed(2)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ ...TD, fontWeight: 700, borderTop: '0.5px solid #e0e0e0' }}>Total</td>
                      <td style={{ ...TD, textAlign: 'right', fontWeight: 700, borderTop: '0.5px solid #e0e0e0' }}>{revenueByService.reduce((s, r) => s + r.amount, 0).toFixed(2)}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ flex: 1, minWidth: 240, backgroundColor: '#f9fafb', borderRadius: 8, padding: 14 }}>
            <p style={{ color: '#034325', fontSize: 12, fontWeight: 600, margin: '0 0 10px' }}>By technician</p>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={TH}>Technician</th><th style={{ ...TH, textAlign: 'right' }}>AED</th></tr></thead>
              <tbody>
                {revenueByStaff.length === 0 ? (
                  <tr>
                    <td style={{ ...TD, color: '#6b7280', fontStyle: 'italic' }} colSpan={2}>No revenue today</td>
                  </tr>
                ) : (
                  <>
                    {revenueByStaff.map(r => (
                      <tr key={r.staff}>
                        <td style={TD}>{r.staff}</td>
                        <td style={{ ...TD, textAlign: 'right' }}>{r.amount.toFixed(2)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ ...TD, fontWeight: 700, borderTop: '0.5px solid #e0e0e0' }}>Total</td>
                      <td style={{ ...TD, textAlign: 'right', fontWeight: 700, borderTop: '0.5px solid #e0e0e0' }}>{revenueByStaff.reduce((s, r) => s + r.amount, 0).toFixed(2)}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}

      {drilldown === 'revenue-week' && (
        <>
        <p style={{ fontSize: 18, fontWeight: 700, color: '#034325', margin: '0 0 16px' }}>
          Total this week: AED {weeklyRevenue.reduce((s, r) => s + r.revenue, 0).toLocaleString()}
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={TH}>Day</th><th style={{ ...TH, textAlign: 'right' }}>Appointments</th><th style={{ ...TH, textAlign: 'right' }}>Revenue</th></tr></thead>
          <tbody>
            {weeklyRevenue.map(row => {
              const hasRev = row.revenue > 0
              return (
                <tr key={row.day} style={{ opacity: row.past ? 1 : 0.4 }}>
                  <td style={TD}>{row.day}</td>
                  <td style={{ ...TD, textAlign: 'right' }}>{hasRev ? row.appointments : '—'}</td>
                  <td style={{ ...TD, textAlign: 'right', fontWeight: hasRev ? 500 : 400 }}>{hasRev ? `AED ${row.revenue.toLocaleString()}` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </>
      )}

      {drilldown === 'revenue-month' && (
        <>
        <p style={{ fontSize: 18, fontWeight: 700, color: '#034325', margin: '0 0 16px' }}>
          Total this month: AED {monthlyRevenue.reduce((s, r) => s + r.revenue, 0).toLocaleString()}
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={TH}>Period</th><th style={{ ...TH, textAlign: 'right' }}>Appointments</th><th style={{ ...TH, textAlign: 'right' }}>Revenue</th></tr></thead>
          <tbody>
            {monthlyRevenue.map(row => {
              const hasRev = row.revenue > 0
              return (
                <tr key={row.period} style={{ opacity: row.past ? 1 : 0.4 }}>
                  <td style={TD}>{row.period}</td>
                  <td style={{ ...TD, textAlign: 'right' }}>{hasRev ? row.appointments : '—'}</td>
                  <td style={{ ...TD, textAlign: 'right', fontWeight: hasRev ? 500 : 400 }}>{hasRev ? `AED ${row.revenue.toLocaleString()}` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </>
      )}

      {drilldown === 'revenue-year' && (
        <>
        <p style={{ fontSize: 18, fontWeight: 700, color: '#034325', margin: '0 0 16px' }}>
          Total this year: AED {yearlyRevenue.reduce((s, r) => s + r.revenue, 0).toLocaleString()}
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={TH}>Month</th><th style={{ ...TH, textAlign: 'right' }}>Appointments</th><th style={{ ...TH, textAlign: 'right' }}>Revenue</th></tr></thead>
          <tbody>
            {yearlyRevenue.map(row => {
              const hasRev = row.revenue > 0
              return (
                <tr key={row.month}>
                  <td style={{ ...TD, color: row.past ? '#000000' : '#9ca3af' }}>{row.month}</td>
                  <td style={{ ...TD, textAlign: 'right', color: row.past ? '#000000' : '#9ca3af' }}>{hasRev ? row.appointments : '—'}</td>
                  <td style={{ ...TD, textAlign: 'right', fontWeight: hasRev ? 500 : 400, color: row.past ? '#000000' : '#9ca3af' }}>{hasRev ? `AED ${row.revenue.toLocaleString()}` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </>
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

function BirthdayStrip({ salonId }: { salonId: string | null }) {
  const [birthdays, setBirthdays] = useState<{ id: string; name: string; date: string; phone: string }[]>([])

  useEffect(() => {
    if (!salonId) return
    supabase
      .from('clients')
      .select('id, name, dob, phone')
      .eq('salon_id', salonId)
      .not('dob', 'is', null)
      .then(({ data }) => {
        if (!data) return
        const today = new Date(Date.now() + 4 * 60 * 60 * 1000)
        const results = data
          .map(c => {
            const dob = c.dob as string
            const [, mm, dd] = dob.split('-').map(Number)
            const y = today.getUTCFullYear()
            let next = new Date(Date.UTC(y, mm - 1, dd))
            if (next < today) next = new Date(Date.UTC(y + 1, mm - 1, dd))
            const diffDays = Math.round((next.getTime() - today.getTime()) / 86_400_000)
            return { id: c.id as string, name: c.name as string, phone: (c.phone as string) ?? '', date: next.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), diffDays }
          })
          .filter(c => c.diffDays <= 7)
          .sort((a, b) => a.diffDays - b.diffDays)
        setBirthdays(results)
      })
  }, [salonId])

  if (birthdays.length === 0) return null

  return (
    <div style={{ backgroundColor: '#ffffff', borderRadius: 8, border: '0.5px solid #e0e0e0', padding: '12px 16px', margin: '0 16px 16px' }}>
      <p style={{ fontSize: 11, fontWeight: 500, color: '#034325', margin: '0 0 10px' }}>
        Birthdays — next 7 days
      </p>
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto' }}>
        {birthdays.map(b => (
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
    const svcs = (a.appointment_services as unknown as { services: { name: string } | null }[]) ?? []
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
      clientId: cid,
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
    const client = a.clients as unknown as { name: string; phone: string | null } | null
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

async function fetchBriefTopClient(salonId: string): Promise<BriefTopClient | null> {
  const dubaiNow = new Date(Date.now() + 4 * 60 * 60 * 1000)
  const ty = dubaiNow.getUTCFullYear()
  const tm = dubaiNow.getUTCMonth()
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate()
  const mm = String(tm + 1).padStart(2, '0')
  const monthStart = `${ty}-${mm}-01T00:00:00+04:00`
  const monthEnd   = `${ty}-${mm}-${String(lastDay).padStart(2, '0')}T23:59:59+04:00`

  const { data: apptRows } = await supabase
    .from('appointments')
    .select('id, client_id, starts_at, clients!inner(name, phone)')
    .eq('salon_id', salonId)
    .eq('status', 'completed')
    .gte('starts_at', monthStart)
    .lte('starts_at', monthEnd)

  if (!apptRows || apptRows.length === 0) return null

  const apptIds = apptRows.map(a => a.id as string)
  const { data: payRows } = await supabase
    .from('payments')
    .select('appointment_id, amount, status')
    .in('appointment_id', apptIds)
    .eq('status', 'completed')

  const apptToClient: Record<string, string> = {}
  for (const a of apptRows) apptToClient[a.id as string] = a.client_id as string

  const map: Record<string, { name: string; phone: string | null; visits: Set<string>; spend: number; lastVisit: string }> = {}
  for (const a of apptRows) {
    const cid = a.client_id as string
    const client = a.clients as unknown as { name: string; phone: string | null } | null
    const starts = (a.starts_at as string | null) ?? ''
    if (!map[cid]) map[cid] = { name: client?.name ?? 'Client', phone: client?.phone ?? null, visits: new Set(), spend: 0, lastVisit: '' }
    map[cid].visits.add(a.id as string)
    if (starts > map[cid].lastVisit) map[cid].lastVisit = starts
  }
  for (const p of payRows ?? []) {
    const aid = p.appointment_id as string
    const cid = apptToClient[aid]
    if (!cid || !map[cid]) continue
    map[cid].spend += (p.amount as number | null) ?? 0
  }

  const ranked = Object.entries(map)
    .map(([clientId, v]) => ({ clientId, name: v.name, phone: v.phone, visits: v.visits.size, spend: Math.round(v.spend * 100) / 100, lastVisit: v.lastVisit }))
    .sort((a, b) => b.spend - a.spend)

  const top = ranked[0]
  if (!top) return null

  const { data: ytdPays, error: ytdErr } = await supabase
    .from('payments')
    .select('amount, status')
    .eq('client_id', top.clientId)
    .eq('status', 'completed')

  const ytdSpend = ytdErr
    ? 0
    : Math.round((ytdPays ?? []).reduce((s, p) => s + ((p.amount as number) ?? 0), 0) * 100) / 100

  return {
    name: top.name,
    phone: top.phone,
    visits: top.visits,
    spend: top.spend,
    lastVisit: top.lastVisit,
    ytdSpend,
  }
}

// ── Morning Brief component ───────────────────────────────────────────────────

function MorningBrief({
  slots, lapsedClient, unpaid, topClient, loading,
  errors,
}: {
  slots: BriefSlot[]
  lapsedClient: BriefLapsedClient | null
  unpaid: BriefUnpaid[]
  topClient: BriefTopClient | null
  loading: boolean
  errors: { slots: boolean; lapsed: boolean; unpaid: boolean; topClient: boolean }
}) {
  const [dtLabel, setDtLabel] = useState(dubaiDateTimeLabel())
  const [activeModal, setActiveModal] = useState<'slots' | 'lapsed' | 'unpaid' | 'topClient' | null>(null)

  useEffect(() => {
    const t = setInterval(() => setDtLabel(dubaiDateTimeLabel()), 60_000)
    return () => clearInterval(t)
  }, [])

  const tileStyle: React.CSSProperties = {
    backgroundColor: 'rgba(255,255,255,0.08)',
    border: '0.5px solid rgba(255,255,255,0.15)',
    borderRadius: 8, padding: '14px 12px',
    textAlign: 'center', cursor: 'pointer',
  }
  const closeStyle: React.CSSProperties = {
    border: '0.5px solid #034325', color: '#034325',
    backgroundColor: 'transparent', borderRadius: 6,
    padding: '4px 12px', fontSize: 13, cursor: 'pointer',
  }
  const modalTitle = activeModal === 'slots'
    ? "Today's appointment gaps"
    : activeModal === 'lapsed'
    ? 'Clients to call'
    : activeModal === 'topClient'
    ? "This month's top client"
    : 'Balance to collect'

  const unpaidTotal = unpaid.reduce((s, u) => s + u.amountOwed, 0)

  return (
    <>
      {/* ── Detail modal ── */}
      {activeModal !== null && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 12, maxWidth: 420, width: '90%', padding: 24 }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111' }}>{modalTitle}</p>
              <button onClick={() => setActiveModal(null)} style={closeStyle}>Close</button>
            </div>

            {/* Slots */}
            {activeModal === 'slots' && (
              loading
                ? <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>Loading...</p>
                : errors.slots
                ? <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>Unable to load — check connection.</p>
                : slots.length === 0
                ? <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>All staff fully booked today.</p>
                : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {slots.map((s, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '0.5px solid #f0f0f0', paddingBottom: 8 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#111' }}>{s.staffName}</p>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                          {s.freeSlots.map((fs, j) => (
                            <p key={j} style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>{fs.from}–{fs.to}</p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
            )}

            {/* Lapsed */}
            {activeModal === 'lapsed' && (
              loading
                ? <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>Loading...</p>
                : errors.lapsed
                ? <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>Unable to load — check connection.</p>
                : !lapsedClient
                ? <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>All active clients visited recently.</p>
                : <div>
                    <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 600, color: '#111' }}>{lapsedClient.name}</p>
                    <p style={{ margin: '0 0 4px', fontSize: 13, color: '#6b7280' }}>{lapsedClient.daysSinceVisit} days since last visit</p>
                    <p style={{ margin: '0 0 4px', fontSize: 13, color: '#6b7280' }}>Last service: {lapsedClient.lastService}</p>
                    <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>{lapsedClient.phone}</p>
                    <button
                      onClick={() => { window.location.href = '/clients/' + lapsedClient.clientId }}
                      style={closeStyle}
                    >Open client profile</button>
                  </div>
            )}

            {/* Unpaid */}
            {activeModal === 'unpaid' && (
              loading
                ? <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>Loading...</p>
                : errors.unpaid
                ? <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>Unable to load — check connection.</p>
                : unpaid.length === 0
                ? <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>No outstanding balances.</p>
                : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {unpaid.map((u, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '0.5px solid #f0f0f0', paddingBottom: 8 }}>
                        <div>
                          <p style={{ margin: '0 0 2px', fontSize: 13, color: '#111' }}>{u.clientName}</p>
                          <p style={{ margin: 0, fontSize: 11, color: '#6b7280' }}>{u.phone}</p>
                        </div>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#991b1b' }}>AED {u.amountOwed.toFixed(2)}</p>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#111' }}>Total</p>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#991b1b' }}>AED {unpaidTotal.toFixed(2)}</p>
                    </div>
                  </div>
            )}

            {/* Top client this month */}
            {activeModal === 'topClient' && (
              loading
                ? <p style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic', margin: 0 }}>Loading...</p>
                : errors.topClient
                ? <p style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic', margin: 0 }}>Could not load data.</p>
                : !topClient
                ? <p style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic', margin: 0 }}>No completed appointments this month.</p>
                : <div>
                    <p style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: '#034325' }}>{topClient.name}</p>
                    <p style={{ margin: '0 0 4px', fontSize: 13, color: '#6b7280' }}>{topClient.visits} visit{topClient.visits === 1 ? '' : 's'} this month</p>
                    <p style={{ margin: '0 0 4px', fontSize: 13, color: '#6b7280' }}>AED {topClient.spend.toLocaleString('en-AE', { maximumFractionDigits: 0 })} spent this month</p>
                    <p style={{ margin: '0 0 4px', fontSize: 13, color: '#6b7280' }}>AED {topClient.ytdSpend.toLocaleString('en-AE', { maximumFractionDigits: 0 })} spent in total</p>
                    <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>
                      Last visit: {topClient.lastVisit
                        ? new Date(topClient.lastVisit).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—'}
                    </p>
                    {topClient.phone && (
                      <button
                        onClick={() => window.open(`https://wa.me/${topClient.phone!.replace(/\D/g, '')}`, '_blank')}
                        style={{ backgroundColor: '#25D366', color: '#ffffff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: 'pointer' }}
                      >
                        WhatsApp
                      </button>
                    )}
                  </div>
            )}

          </div>
        </div>
      )}

      {/* ── Morning Brief card ── */}
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

        {/* Four tappable tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          <div onClick={() => setActiveModal('slots')} style={tileStyle}>
            <p style={{ fontSize: 13, fontWeight: 500, color: '#ffffff', margin: 0 }}>Today's appointment gaps</p>
          </div>
          <div onClick={() => setActiveModal('lapsed')} style={tileStyle}>
            <p style={{ fontSize: 13, fontWeight: 500, color: '#ffffff', margin: 0 }}>Clients to call</p>
          </div>
          <div onClick={() => setActiveModal('unpaid')} style={tileStyle}>
            <p style={{ fontSize: 13, fontWeight: 500, color: '#ffffff', margin: 0 }}>Balance to collect</p>
          </div>
          <div onClick={() => setActiveModal('topClient')} style={tileStyle}>
            <p style={{ fontSize: 13, fontWeight: 500, color: '#ffffff', margin: 0 }}>This month's top client</p>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate()
  const staffRecord = useAuthStore(s => s.staffRecord)
  const [drilldownStack, setDrilldownStack] = useState<Exclude<DrillDown, null>[]>([])
  const drilldown: DrillDown = drilldownStack.length > 0 ? drilldownStack[drilldownStack.length - 1] : null
  const pushDrilldown = (d: Exclude<DrillDown, null>) => setDrilldownStack(s => [...s, d])
  const popDrilldown = () => setDrilldownStack(s => s.slice(0, -1))
  const resetDrilldown = () => setDrilldownStack([])
  const [cards, setCards] = useState<ApptFetched[]>([])
  const [cardsLoading, setCardsLoading] = useState(true)
  const [focusTick, setFocusTick] = useState(0)
  const [summaryRevenue,      setSummaryRevenue]      = useState({ total: 0, paymentsCount: 0 })
  const [revenueByService,    setRevenueByService]    = useState<{ service: string; amount: number }[]>([])
  const [revenueByStaff,      setRevenueByStaff]      = useState<{ staff: string; amount: number }[]>([])
  const [weeklyRevenue,       setWeeklyRevenue]       = useState<{ day: string; appointments: number; revenue: number; past: boolean }[]>([])
  const [monthlyRevenue,      setMonthlyRevenue]      = useState<{ period: string; appointments: number; revenue: number; past: boolean }[]>([])
  const [yearlyRevenue,       setYearlyRevenue]       = useState<{ month: string; appointments: number; revenue: number; past: boolean }[]>([])
  const [topRunnerWeek,       setTopRunnerWeek]       = useState<{ day: string; appointments: number; revenue: number; past: boolean }[]>([])
  const [summaryAppointments, setSummaryAppointments] = useState({ total: 0, completed: 0, walkIns: 0, noShow: 0 })
  const [summaryTopRunner,    setSummaryTopRunner]    = useState<{ name: string; revenue: number; appointments: number; appointmentIds: string[] } | null>(null)
  const [briefSlots,          setBriefSlots]          = useState<BriefSlot[]>([])
  const [briefLapsedClient,   setBriefLapsedClient]   = useState<BriefLapsedClient | null>(null)
  const [briefUnpaid,         setBriefUnpaid]         = useState<BriefUnpaid[]>([])
  const [briefTopClient,      setBriefTopClient]      = useState<BriefTopClient | null>(null)
  const [briefLoading,        setBriefLoading]        = useState(true)
  const [briefErrors,         setBriefErrors]         = useState({ slots: false, lapsed: false, unpaid: false, topClient: false })

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

      // ── Trend revenue: week / month / year (year-wide, independent of today) ──
      const dubaiNow = new Date(Date.now() + 4 * 60 * 60 * 1000)
      const ty = dubaiNow.getUTCFullYear()
      const tm = dubaiNow.getUTCMonth()   // 0..11
      const td = dubaiNow.getUTCDate()
      const todayYMD = dubaiNow.toISOString().slice(0, 10)

      const yearStartISO = `${ty}-01-01T00:00:00+04:00`
      const yearEndISO   = `${ty}-12-31T23:59:59+04:00`

      const [{ data: yearAppts }, { data: yearPays }] = await Promise.all([
        supabase.from('appointments')
          .select('starts_at')
          .eq('salon_id', salonId)
          .eq('status', 'completed')
          .gte('starts_at', yearStartISO)
          .lt('starts_at', yearEndISO),
        supabase.from('payments')
          .select('amount, created_at')
          .eq('salon_id', salonId)
          .eq('status', 'completed')
          .gte('created_at', yearStartISO)
          .lt('created_at', yearEndISO),
      ])

      const toDubaiDate = (iso: string): string =>
        new Date(new Date(iso).getTime() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10)

      const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      const dayIdx = (dubaiNow.getUTCDay() + 6) % 7
      const mondayMs = Date.UTC(ty, tm, td) - dayIdx * 86_400_000
      const weekDateStrs: string[] = []
      for (let i = 0; i < 7; i++) {
        weekDateStrs.push(new Date(mondayMs + i * 86_400_000).toISOString().slice(0, 10))
      }
      const weeklyBuckets = dayLabels.map((day, i) => ({
        day, appointments: 0, revenue: 0, past: weekDateStrs[i] < todayYMD,
      }))

      // 7-row Mon-Sun zero template — reused as the top-runner-week fallback when there is no top runner today
      const emptyTopRunnerWeek = dayLabels.map((day, i) => ({
        day, appointments: 0, revenue: 0, past: weekDateStrs[i] < todayYMD,
      }))

      const lastDayOfMonth = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate()
      const monthlyRanges = [
        { period: 'Week 1', start: 1,  end: 7 },
        { period: 'Week 2', start: 8,  end: 14 },
        { period: 'Week 3', start: 15, end: 21 },
        { period: 'Week 4', start: 22, end: lastDayOfMonth },
      ]
      const monthlyBuckets = monthlyRanges.map(r => ({
        period: r.period, appointments: 0, revenue: 0, past: r.end < td,
      }))

      const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      const yearlyBuckets = monthLabels.map((month, i) => ({
        month, appointments: 0, revenue: 0, past: i < tm,
      }))

      for (const a of yearAppts ?? []) {
        const ds = toDubaiDate(a.starts_at as string)
        const wi = weekDateStrs.indexOf(ds)
        if (wi !== -1) weeklyBuckets[wi].appointments++
        const dy = parseInt(ds.slice(0, 4))
        const dmo = parseInt(ds.slice(5, 7)) - 1
        const dd = parseInt(ds.slice(8, 10))
        if (dy === ty) {
          yearlyBuckets[dmo].appointments++
          if (dmo === tm) {
            for (let j = 0; j < monthlyRanges.length; j++) {
              if (dd >= monthlyRanges[j].start && dd <= monthlyRanges[j].end) {
                monthlyBuckets[j].appointments++
                break
              }
            }
          }
        }
      }

      for (const p of yearPays ?? []) {
        const ds = toDubaiDate(p.created_at as string)
        const amt = (p.amount as number) ?? 0
        const wi = weekDateStrs.indexOf(ds)
        if (wi !== -1) weeklyBuckets[wi].revenue += amt
        const dy = parseInt(ds.slice(0, 4))
        const dmo = parseInt(ds.slice(5, 7)) - 1
        const dd = parseInt(ds.slice(8, 10))
        if (dy === ty) {
          yearlyBuckets[dmo].revenue += amt
          if (dmo === tm) {
            for (let j = 0; j < monthlyRanges.length; j++) {
              if (dd >= monthlyRanges[j].start && dd <= monthlyRanges[j].end) {
                monthlyBuckets[j].revenue += amt
                break
              }
            }
          }
        }
      }

      const round2 = (n: number) => Math.round(n * 100) / 100
      const weeklyOut  = weeklyBuckets.map(b => ({ ...b, revenue: round2(b.revenue) }))
      const monthlyOut = monthlyBuckets.map(b => ({ ...b, revenue: round2(b.revenue) }))
      const yearlyOut  = yearlyBuckets.map(b => ({ ...b, revenue: round2(b.revenue) }))

      if (appts.length === 0) {
        if (!cancelled) {
          setCards([])
          setSummaryAppointments(summaryAppts)
          setSummaryRevenue({ total: 0, paymentsCount: 0 })
          setRevenueByService([])
          setRevenueByStaff([])
          setWeeklyRevenue(weeklyOut)
          setMonthlyRevenue(monthlyOut)
          setYearlyRevenue(yearlyOut)
          setTopRunnerWeek(emptyTopRunnerWeek)
          setSummaryTopRunner(null)
          if (firstLoad) { setCardsLoading(false); firstLoad = false }
        }
        return
      }

      // Query 2 + 3 in parallel: services and payments
      const [{ data: svcRows }, { data: payRows }] = await Promise.all([
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

      // Build lookup: appointment_id → service list
      const svcMap: Record<string, ApptService[]> = {}
      for (const row of svcRows ?? []) {
        const apptId = row.appointment_id as string
        if (!svcMap[apptId]) svcMap[apptId] = []
        svcMap[apptId].push({
          name:      (row.services as unknown as { name: string } | null)?.name ?? '—',
          staffName: (row.staff as unknown as { name: string } | null)?.name ?? '',
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
          clientName:  (a.clients as unknown as { name: string } | null)?.name ?? 'Client',
          staffName:   (a.staff as unknown as { name: string } | null)?.name ?? '',
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
        const staffName = (row.staff as unknown as { name: string } | null)?.name ?? ''
        if (!staffName) continue
        if (!staffRevMap[staffName]) staffRevMap[staffName] = { revenue: 0, apptIds: new Set() }
        staffRevMap[staffName].revenue += (row.price as number) ?? 0
        staffRevMap[staffName].apptIds.add(apptId)
      }
      let topRunner: { name: string; revenue: number; appointments: number; appointmentIds: string[] } | null = null
      for (const [name, data] of Object.entries(staffRevMap)) {
        const rev = Math.round(data.revenue * 100) / 100
        if (!topRunner || rev > topRunner.revenue) {
          topRunner = { name, revenue: rev, appointments: data.apptIds.size, appointmentIds: Array.from(data.apptIds) }
        }
      }

      // Top runner's Mon-Sun stats for current week (uses mondayMs/weekDateStrs/dayLabels/todayYMD from trend block)
      let topRunnerWeekOut: { day: string; appointments: number; revenue: number; past: boolean }[] = emptyTopRunnerWeek
      if (topRunner) {
        const weekStartISO = `${new Date(mondayMs).toISOString().slice(0, 10)}T00:00:00+04:00`
        const sundayMs = mondayMs + 6 * 86_400_000
        const weekEndISO   = `${new Date(sundayMs).toISOString().slice(0, 10)}T23:59:59+04:00`

        const { data: trSvcRows } = await supabase
          .from('appointment_services')
          .select('appointment_id, price, staff!inner(name), appointments!inner(starts_at, status, salon_id)')
          .eq('appointments.salon_id', salonId)
          .eq('appointments.status', 'completed')
          .eq('staff.name', topRunner.name)
          .gte('appointments.starts_at', weekStartISO)
          .lt('appointments.starts_at', weekEndISO)

        const trBuckets = dayLabels.map((day, i) => ({
          day,
          appointments: 0,
          revenue: 0,
          past: weekDateStrs[i] < todayYMD,
          _ids: new Set<string>(),
        }))

        for (const row of trSvcRows ?? []) {
          const appt = (row.appointments as unknown as { starts_at: string } | null)
          if (!appt?.starts_at) continue
          const ds = new Date(new Date(appt.starts_at).getTime() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10)
          const wi = weekDateStrs.indexOf(ds)
          if (wi === -1) continue
          trBuckets[wi]._ids.add(row.appointment_id as string)
          trBuckets[wi].revenue += (row.price as number | null) ?? 0
        }
        topRunnerWeekOut = trBuckets.map(b => ({
          day: b.day,
          appointments: b._ids.size,
          revenue: Math.round(b.revenue * 100) / 100,
          past: b.past,
        }))
      }

      // Derive revenue-by-service and revenue-by-staff from today's completed appointment_services
      const svcRevMap: Record<string, number> = {}
      const staffRev2Map: Record<string, number> = {}
      for (const row of svcRows ?? []) {
        const apptId = row.appointment_id as string
        if (!completedIds.has(apptId)) continue
        const price = (row.price as number | null) ?? 0
        const sName = (row.services as unknown as { name: string } | null)?.name || 'Unassigned'
        const stName = (row.staff as unknown as { name: string } | null)?.name || 'Unassigned'
        svcRevMap[sName]    = (svcRevMap[sName]    ?? 0) + price
        staffRev2Map[stName] = (staffRev2Map[stName] ?? 0) + price
      }
      const revByService = Object.entries(svcRevMap)
        .map(([service, amount]) => ({ service, amount: Math.round(amount * 100) / 100 }))
        .sort((a, b) => b.amount - a.amount)
      const revByStaff = Object.entries(staffRev2Map)
        .map(([staff, amount]) => ({ staff, amount: Math.round(amount * 100) / 100 }))
        .sort((a, b) => b.amount - a.amount)

      if (!cancelled) {
        setCards(withPayments)
        setSummaryAppointments(summaryAppts)
        setSummaryRevenue({ total: revTotal, paymentsCount: revCount })
        setRevenueByService(revByService)
        setRevenueByStaff(revByStaff)
        setWeeklyRevenue(weeklyOut)
        setMonthlyRevenue(monthlyOut)
        setYearlyRevenue(yearlyOut)
        setTopRunnerWeek(topRunnerWeekOut)
        setSummaryTopRunner(topRunner)
        if (firstLoad) { setCardsLoading(false); firstLoad = false }
      }
    }

    async function fetchBrief() {
      const salonId = staffRecord?.salon_id
      if (!salonId || cancelled) return
      setBriefLoading(true)
      const [slotsRes, lapsedRes, unpaidRes, topClientRes] = await Promise.all([
        fetchBriefSlots(salonId).then(d => ({ d, e: false })).catch(() => ({ d: [] as BriefSlot[], e: true })),
        fetchBriefLapsedClient(salonId).then(d => ({ d, e: false })).catch(() => ({ d: null as BriefLapsedClient | null, e: true })),
        fetchBriefUnpaid(salonId).then(d => ({ d, e: false })).catch(() => ({ d: [] as BriefUnpaid[], e: true })),
        fetchBriefTopClient(salonId).then(d => ({ d, e: false })).catch(() => ({ d: null as BriefTopClient | null, e: true })),
      ])
      if (!cancelled) {
        setBriefSlots(slotsRes.d)
        setBriefLapsedClient(lapsedRes.d)
        setBriefUnpaid(unpaidRes.d)
        setBriefTopClient(topClientRes.d)
        setBriefErrors({ slots: slotsRes.e, lapsed: lapsedRes.e, unpaid: unpaidRes.e, topClient: topClientRes.e })
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

      <Topbar onDashboardClick={resetDrilldown} />

      <div style={{ marginTop: 52, flex: 1, display: 'flex', flexDirection: 'column' }}>

        {/* ── Morning Brief ── */}
        <MorningBrief
          slots={briefSlots}
          lapsedClient={briefLapsedClient}
          unpaid={briefUnpaid}
          topClient={briefTopClient}
          loading={briefLoading}
          errors={briefErrors}
        />

        {/* ── Summary strip ── */}
        <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <SummaryCard
            label="Revenue today"
            value={<Clickable onClick={() => pushDrilldown('revenue-today')}>AED {summaryRevenue.total.toLocaleString()}</Clickable>}
            sub={<span style={{ color: '#6b7280', fontSize: 11 }}>{summaryRevenue.paymentsCount} payments collected</span>}
          />
          <SummaryCard
            label="Top runner today"
            value={<Clickable onClick={() => pushDrilldown('toprunner')}><span style={{ fontSize: 18 }}>{summaryTopRunner?.name ?? '—'}</span></Clickable>}
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
            value={<Clickable onClick={() => pushDrilldown('appointments')}>{summaryAppointments.total}</Clickable>}
            sub={
              <span style={{ fontSize: 11 }}>
                <Clickable onClick={() => pushDrilldown('completed')}><span style={{ color: '#034325' }}>{summaryAppointments.completed} completed</span></Clickable>
                <span style={{ color: '#6b7280' }}> · </span>
                <Clickable onClick={() => pushDrilldown('walkins')}><span style={{ color: '#034325' }}>{summaryAppointments.walkIns} walk-ins</span></Clickable>
                <span style={{ color: '#6b7280' }}> · {summaryAppointments.noShow} no-show</span>
              </span>
            }
          />
        </div>

        {/* ── Main area ── */}
        {drilldown !== null ? (
          <DrillDownPanel drilldown={drilldown} onBack={popDrilldown} onDrilldown={pushDrilldown} cards={cards} revenueByService={revenueByService} revenueByStaff={revenueByStaff} weeklyRevenue={weeklyRevenue} monthlyRevenue={monthlyRevenue} yearlyRevenue={yearlyRevenue} topRunnerName={summaryTopRunner?.name ?? null} topRunnerAppointmentIds={summaryTopRunner?.appointmentIds ?? []} topRunnerWeek={topRunnerWeek} summaryAppointments={summaryAppointments} />
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
            <BirthdayStrip salonId={staffRecord?.salon_id ?? null} />

            {/* Market Pulse */}
            <MarketPulse />
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
