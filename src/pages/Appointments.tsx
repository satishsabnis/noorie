import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Topbar from '../components/Topbar'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useSalonTimezone, salonOffsetStr } from '../hooks/useSalonTimezone'

interface ApptRow {
  id: string
  reference_number: number | null
  starts_at: string
  ends_at: string
  status: string
  is_walk_in: boolean
  clients: { id: string; name: string; phone: string } | null
  staff: { id: string; name: string } | null
  serviceNames: string
  totalPrice: number
}

function fmtApptRef(n: number | null | undefined): string {
  return n != null ? `APT-${String(n).padStart(4, '0')}` : '—'
}

function todayStr(tz = 'Asia/Dubai') {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz })
}

function fmtTime(iso: string, tz = 'Asia/Dubai') {
  return new Date(iso).toLocaleTimeString('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

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

export default function Appointments() {
  const navigate = useNavigate()
  const staffRecord = useAuthStore(s => s.staffRecord)
  const { tz } = useSalonTimezone()

  const [dateFilter, setDateFilter] = useState(todayStr())
  const [statusFilter, setStatusFilter] = useState('')
  const [staffFilter, setStaffFilter] = useState('')
  const [search, setSearch] = useState('')

  const [rows, setRows] = useState<ApptRow[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [staffSvcMap, setStaffSvcMap] = useState<Record<string, Record<string, number>>>({})
  const [staffIdMap, setStaffIdMap] = useState<Record<string, string>>({})
  const [svcStaffNames, setSvcStaffNames] = useState<string[]>([])

  useEffect(() => {
    const salonId = staffRecord?.salon_id
    if (!salonId || !dateFilter) return

    let cancelled = false
    setLoading(true)
    setFetchError(null)

    async function fetchData() {
      const { data: appts, error: apptErr } = await supabase
        .from('appointments')
        .select(`
          id,
          reference_number,
          starts_at,
          ends_at,
          status,
          is_walk_in,
          clients ( id, name, phone ),
          staff ( id, name )
        `)
        .eq('salon_id', salonId)
        .gte('starts_at', `${dateFilter}T00:00:00${salonOffsetStr(tz)}`)
        .lt('starts_at', `${dateFilter}T23:59:59${salonOffsetStr(tz)}`)
        .order('starts_at', { ascending: true })

      if (apptErr) {
        if (!cancelled) { setFetchError(apptErr.message); setLoading(false) }
        return
      }

      if (!appts || appts.length === 0) {
        if (!cancelled) { setRows([]); setLoading(false) }
        return
      }

      const appointmentIds = appts.map(a => a.id)

      const { data: svcRows, error: svcErr } = await supabase
        .from('appointment_services')
        .select('appointment_id, price, staff_id, services(name), staff(id, name)')
        .in('appointment_id', appointmentIds)

      if (svcErr) {
        if (!cancelled) { setFetchError(svcErr.message); setLoading(false) }
        return
      }

      const svcMap: Record<string, { names: string[]; total: number }> = {}
      for (const row of svcRows ?? []) {
        const apptId = row.appointment_id as string
        if (!svcMap[apptId]) svcMap[apptId] = { names: [], total: 0 }
        
        const servicesData = row.services as any
        let serviceName: string | null = null
        
        if (servicesData) {
          if (Array.isArray(servicesData) && servicesData.length > 0) {
            serviceName = servicesData[0]?.name ?? null
          } else if (!Array.isArray(servicesData)) {
            serviceName = servicesData.name ?? null
          }
        }
        
        if (serviceName) svcMap[apptId].names.push(serviceName)
        svcMap[apptId].total += (row.price as number | null) ?? 0
      }

      const staffSvcMap: Record<string, Record<string, number>> = {}
      for (const s of svcRows ?? []) {
        const sid = s.staff_id as string | null
        if (!sid) continue
        const aid = s.appointment_id as string
        if (!staffSvcMap[aid]) staffSvcMap[aid] = {}
        if (!staffSvcMap[aid][sid]) staffSvcMap[aid][sid] = 0
        staffSvcMap[aid][sid] += (s.price as number | null) ?? 0
      }

      const staffIdMap: Record<string, string> = {}
      for (const s of svcRows ?? []) {
        const sObj = s.staff as unknown as { id: string; name: string } | null
        if (sObj?.name && sObj?.id) staffIdMap[sObj.name] = sObj.id
      }

      const svcStaffNamesComputed = Array.from(new Set((svcRows ?? []).map(s => (s.staff as unknown as { name: string } | null)?.name).filter(Boolean) as string[])).sort()

      const merged: ApptRow[] = appts.map((a: any) => {
        const clientsData = a.clients as any
        let clientsObj = null
        if (clientsData) {
          if (Array.isArray(clientsData) && clientsData.length > 0) {
            clientsObj = clientsData[0]
          } else if (!Array.isArray(clientsData)) {
            clientsObj = clientsData
          }
        }
        
        const staffData = a.staff as any
        let staffObj = null
        if (staffData) {
          if (Array.isArray(staffData) && staffData.length > 0) {
            staffObj = staffData[0]
          } else if (!Array.isArray(staffData)) {
            staffObj = staffData
          }
        }
        
        return {
          id: a.id as string,
          reference_number: (a.reference_number as number | null) ?? null,
          starts_at: a.starts_at as string,
          ends_at: a.ends_at as string,
          status: a.status as string,
          is_walk_in: a.is_walk_in as boolean,
          clients: clientsObj,
          staff: staffObj,
          serviceNames: svcMap[a.id]?.names.join(', ') || '—',
          totalPrice: svcMap[a.id]?.total ?? 0,
        }
      })

      if (!cancelled) {
        setRows(merged)
        setStaffSvcMap(staffSvcMap)
        setStaffIdMap(staffIdMap)
        setSvcStaffNames(svcStaffNamesComputed)
        setLoading(false)
      }
    }

    fetchData()
    return () => { cancelled = true }
  }, [dateFilter, staffRecord?.salon_id])

  const filtered = useMemo(() => {
    return rows.filter(a => {
      if (statusFilter && a.status !== statusFilter) return false
      if (staffFilter) {
        const sid = staffIdMap[staffFilter]
        const apptStaffSvcs = sid ? staffSvcMap[a.id as string] : null
        if (!apptStaffSvcs || !apptStaffSvcs[sid]) return false
      }
      if (search.trim()) {
        const q = search.toLowerCase()
        const clientMatch = a.clients?.name.toLowerCase().includes(q) ?? false
        const serviceMatch = a.serviceNames.toLowerCase().includes(q)
        if (!clientMatch && !serviceMatch) return false
      }
      return true
    })
  }, [rows, statusFilter, staffFilter, search, staffIdMap, staffSvcMap])

  const staffNames = svcStaffNames

  const completedCount = filtered.filter(a => a.status === 'completed').length
  const totalRevenue = filtered.reduce((sum, a) => {
    if (a.status !== 'completed') return sum
    if (staffFilter) {
      const sid = staffIdMap[staffFilter]
      return sum + (sid && staffSvcMap[a.id as string]?.[sid] ? staffSvcMap[a.id as string][sid] : 0)
    }
    return sum + a.totalPrice
  }, 0)

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', display: 'flex', flexDirection: 'column' }}>

      <Topbar />

      <div style={{ marginTop: 52, flex: 1, padding: '20px 16px 32px' }}>

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
                  <th style={TH}>Ref</th>
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
                    <tr key={a.id} onClick={() => navigate(`/appointment/${a.id}`)} style={{ cursor: 'pointer' }}>
                      <td style={TD}>
                        <span style={{
                          fontSize: 11,
                          fontFamily: 'monospace',
                          color: 'var(--color-text-secondary, #6b7280)',
                          backgroundColor: 'var(--color-background-secondary, #f9fafb)',
                          padding: '2px 6px',
                          borderRadius: 4,
                          border: '0.5px solid #e0e0e0',
                        }}>
                          {fmtApptRef(a.reference_number)}
                        </span>
                      </td>
                      <td style={{ ...TD, fontVariantNumeric: 'tabular-nums', color: '#6b7280' }}>
                        {fmtTime(a.starts_at, tz)}
                      </td>
                      <td style={{ ...TD, fontWeight: 500 }}>
                        {a.clients?.name ?? '—'}
                      </td>
                      <td style={TD}>{a.serviceNames}</td>
                      <td style={TD}>{a.staff?.name ?? 'Multiple staff'}</td>
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