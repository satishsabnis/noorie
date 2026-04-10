import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Topbar from '../components/Topbar'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApptRow {
  id: string
  starts_at: string
  ends_at: string
  status: string
  is_walk_in: boolean
  clients: { id: string; name: string; phone: string } | null
  staff: { id: string; name: string } | null
  serviceNames: string   // comma-separated, pre-computed at fetch time
  totalPrice: number     // sum of appointment_services.price
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr() {
  // Dubai local date (UTC+4) — avoids Intl API inconsistencies
  return new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function fmtTime(iso: string) {
  // Parse UTC timestamp and display in Dubai local time (UTC+4)
  return new Date(iso).toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Dubai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

// ── Styles ────────────────────────────────────────────────────────────────────

const TH: React.CSSProperties = {
  textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280',
  padding: '6px 10px', borderBottom: '0.5px solid #e0e0e0', whiteSpace: 'nowrap',
}
const TD: React.CSSProperties = {
  fontSize: 12, color: '#000000', padding: '8px 10px',
  borderBottom: '0.5px solid #f0f0f0', verticalAlign: 'middle',
}
const inputStyle: React.CSSProperties = {
  fontSize: 12, color: '#000000', border: '0.5px solid #e0e0e0',
  borderRadius: 6, padding: '6px 10px', outline: 'none',
  backgroundColor: '#ffffff',
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, React.CSSProperties> = {
    completed:   { backgroundColor: '#034325', color: '#ffffff' },
    in_progress: { backgroundColor: '#f0fdf4', color: '#034325', border: '0.5px solid #d1fae5' },
    scheduled:   { backgroundColor: '#f9fafb', color: '#6b7280', border: '0.5px solid #e0e0e0' },
    no_show:     { backgroundColor: '#fee2e2', color: '#991b1b' },
  }
  const labels: Record<string, string> = {
    completed: 'Completed', in_progress: 'In progress',
    scheduled: 'Scheduled', no_show: 'No show',
  }
  return (
    <span style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 500, whiteSpace: 'nowrap',
      ...(map[status] ?? { backgroundColor: '#f9fafb', color: '#6b7280' }),
    }}>
      {labels[status] ?? status}
    </span>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Appointments() {
  const navigate = useNavigate()
  const staffRecord = useAuthStore(s => s.staffRecord)

  const [dateFilter, setDateFilter]     = useState(todayStr())
  const [statusFilter, setStatusFilter] = useState('')
  const [staffFilter, setStaffFilter]   = useState('')
  const [search, setSearch]             = useState('')

  const [rows, setRows]           = useState<ApptRow[]>([])
  const [loading, setLoading]     = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // ── Fetch ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    const salonId = staffRecord?.salon_id
    if (!salonId || !dateFilter) return

    let cancelled = false
    setLoading(true)
    setFetchError(null)

    async function fetchData() {
      // ── Query 1: appointments with clients + staff ──────────────────────────
      const { data: appts, error: apptErr } = await supabase
        .from('appointments')
        .select(`
          id,
          starts_at,
          ends_at,
          status,
          is_walk_in,
          clients ( id, name, phone ),
          staff ( id, name )
        `)
        .eq('salon_id', salonId)
        .gte('starts_at', `${dateFilter}T00:00:00+04:00`)
        .lt('starts_at', `${dateFilter}T23:59:59+04:00`)
        .order('starts_at', { ascending: true })

      if (apptErr) {
        if (!cancelled) { setFetchError(apptErr.message); setLoading(false) }
        return
      }

      if (!appts || appts.length === 0) {
        if (!cancelled) { setRows([]); setLoading(false) }
        return
      }

      // ── Query 2: appointment_services joined with services ──────────────────
      const appointmentIds = appts.map(a => a.id)

      const { data: svcRows, error: svcErr } = await supabase
        .from('appointment_services')
        .select('appointment_id, price, services(name)')
        .in('appointment_id', appointmentIds)

      if (svcErr) {
        if (!cancelled) { setFetchError(svcErr.message); setLoading(false) }
        return
      }

      // ── Merge: build lookup appointment_id → names + total price ───────────
      const svcMap: Record<string, { names: string[]; total: number }> = {}
      for (const row of svcRows ?? []) {
        const apptId = row.appointment_id as string
        if (!svcMap[apptId]) svcMap[apptId] = { names: [], total: 0 }
        const svcName = (row.services as { name: string } | null)?.name
        if (svcName) svcMap[apptId].names.push(svcName)
        svcMap[apptId].total += (row.price as number | null) ?? 0
      }

      const merged: ApptRow[] = appts.map(a => ({
        ...(a as Omit<ApptRow, 'serviceNames' | 'totalPrice'>),
        serviceNames: svcMap[a.id]?.names.join(', ') || '—',
        totalPrice:   svcMap[a.id]?.total ?? 0,
      }))

      if (!cancelled) { setRows(merged); setLoading(false) }
    }

    fetchData()
    return () => { cancelled = true }
  }, [dateFilter, staffRecord?.salon_id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Client-side filters ─────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return rows.filter(a => {
      if (statusFilter && a.status !== statusFilter) return false
      if (staffFilter && a.staff?.name !== staffFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const clientMatch = a.clients?.name.toLowerCase().includes(q) ?? false
        const serviceMatch = a.serviceNames.toLowerCase().includes(q)
        if (!clientMatch && !serviceMatch) return false
      }
      return true
    })
  }, [rows, statusFilter, staffFilter, search])

  // Staff names for dropdown — derived from fetched data
  const staffNames = useMemo(() => {
    const names = new Set(
      rows.map(a => a.staff?.name).filter((n): n is string => !!n)
    )
    return Array.from(names).sort()
  }, [rows])

  const completedCount = filtered.filter(a => a.status === 'completed').length
  const totalRevenue = filtered.reduce((sum, a) => {
    if (a.status !== 'completed') return sum
    return sum + a.totalPrice
  }, 0)

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', display: 'flex', flexDirection: 'column' }}>

      <Topbar />

      <div style={{ marginTop: 52, flex: 1, padding: '20px 16px 32px' }}>

        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#000000' }}>Appointments</h1>
          <button
            onClick={() => navigate('/new-appointment')}
            style={{
              backgroundColor: '#034325', color: '#ffffff',
              border: 'none', borderRadius: 6,
              padding: '7px 14px', fontSize: 12, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + New
          </button>
        </div>

        {/* Filter row */}
        <div style={{
          backgroundColor: '#ffffff', border: '0.5px solid #e0e0e0', borderRadius: 8,
          padding: '12px 14px', marginBottom: 12,
          display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <input
            type="date"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            style={inputStyle}
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            <option value="">All statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="no_show">No show</option>
          </select>
          <select
            value={staffFilter}
            onChange={e => setStaffFilter(e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            <option value="">All staff</option>
            {staffNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <input
            type="text"
            placeholder="Search client or service…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...inputStyle, minWidth: 200, flex: 1 }}
            autoComplete="off"
          />
          {(statusFilter || staffFilter || search) && (
            <button
              onClick={() => { setStatusFilter(''); setStaffFilter(''); setSearch('') }}
              style={{
                background: 'none', border: '0.5px solid #e0e0e0',
                color: '#6b7280', borderRadius: 6, padding: '6px 10px',
                fontSize: 11, cursor: 'pointer',
              }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Summary chips */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <span style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 4,
            backgroundColor: '#f0fdf4', color: '#034325', border: '0.5px solid #d1fae5',
          }}>
            {filtered.length} appointments
          </span>
          <span style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 4,
            backgroundColor: '#034325', color: '#ffffff',
          }}>
            {completedCount} completed
          </span>
          {totalRevenue > 0 && (
            <span style={{
              fontSize: 11, padding: '3px 10px', borderRadius: 4,
              backgroundColor: '#f9fafb', color: '#6b7280', border: '0.5px solid #e0e0e0',
            }}>
              AED {totalRevenue.toLocaleString()} collected
            </span>
          )}
        </div>

        {/* Table */}
        <div style={{ backgroundColor: '#ffffff', border: '0.5px solid #e0e0e0', borderRadius: 8, overflowX: 'auto' }}>
          {loading ? (
            <p style={{ textAlign: 'center', padding: 32, color: '#6b7280', fontSize: 12, margin: 0 }}>
              Loading…
            </p>
          ) : fetchError ? (
            <p style={{ textAlign: 'center', padding: 32, color: '#dc2626', fontSize: 12, margin: 0 }}>
              {fetchError}
            </p>
          ) : filtered.length === 0 ? (
            <p style={{ textAlign: 'center', padding: 32, color: '#6b7280', fontSize: 12, margin: 0 }}>
              No appointments found for this date.
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={TH}>Time</th>
                  <th style={TH}>Client</th>
                  <th style={TH}>Services</th>
                  <th style={TH}>Staff</th>
                  <th style={TH}>Status</th>
                  <th style={{ ...TH, textAlign: 'center' }}>Walk-in</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Payment</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => {
                  const payment = a.status === 'completed' ? a.totalPrice : 0
                  return (
                    <tr key={a.id}>
                      <td style={{ ...TD, fontVariantNumeric: 'tabular-nums', color: '#6b7280' }}>
                        {fmtTime(a.starts_at)}
                      </td>
                      <td style={{ ...TD, fontWeight: 500 }}>
                        {a.clients?.name ?? '—'}
                      </td>
                      <td style={TD}>{a.serviceNames}</td>
                      <td style={TD}>{a.staff?.name ?? '—'}</td>
                      <td style={TD}><StatusBadge status={a.status} /></td>
                      <td style={{ ...TD, textAlign: 'center' }}>
                        {a.is_walk_in
                          ? <span style={{ fontSize: 10, color: '#1D558F', fontWeight: 600 }}>Walk-in</span>
                          : <span style={{ color: '#d1d5db', fontSize: 10 }}>—</span>
                        }
                      </td>
                      <td style={{
                        ...TD, textAlign: 'right',
                        fontWeight: payment > 0 ? 600 : 400,
                        color: payment > 0 ? '#034325' : '#9ca3af',
                      }}>
                        {payment > 0 ? `AED ${payment.toFixed(2)}` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

      </div>

      <div style={{ textAlign: 'center', padding: '10px 0 14px' }}>
        <p style={{ color: '#9ca3af', fontSize: 10, margin: 0 }}>
          Powered by Blue Flute Consulting LLC-FZ
        </p>
      </div>

    </div>
  )
}
