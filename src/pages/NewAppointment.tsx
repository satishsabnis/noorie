import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Topbar from '../components/Topbar'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockClients = [
  { id: '00000000-0000-0000-0000-000000000001', name: 'Priya Sharma',  phone: '+971501234567' },
  { id: '00000000-0000-0000-0000-000000000002', name: 'Sara Khalid',   phone: '+971502345678' },
]

const mockServices = [
  { id: '00000000-0000-0000-0000-000000000020', name: 'Hair Colour',         price: 180, duration: 90  },
  { id: '00000000-0000-0000-0000-000000000021', name: 'Facial',              price: 150, duration: 60  },
  { id: '00000000-0000-0000-0000-000000000022', name: 'Keratin Treatment',   price: 220, duration: 120 },
  { id: '00000000-0000-0000-0000-000000000023', name: 'Blowout',             price: 80,  duration: 45  },
  { id: '00000000-0000-0000-0000-000000000024', name: 'Hair Cut',            price: 60,  duration: 30  },
  { id: '00000000-0000-0000-0000-000000000025', name: 'Manicure + Pedicure', price: 120, duration: 60  },
  { id: '00000000-0000-0000-0000-000000000026', name: 'Gel Nails',           price: 100, duration: 60  },
  { id: '00000000-0000-0000-0000-000000000027', name: 'Nail Art',            price: 80,  duration: 45  },
  { id: '00000000-0000-0000-0000-000000000028', name: 'Eyebrow Threading',   price: 30,  duration: 20  },
  { id: '00000000-0000-0000-0000-000000000029', name: 'Full Body Wax',       price: 200, duration: 90  },
  { id: '00000000-0000-0000-0000-000000000030', name: 'Lash Lift',           price: 120, duration: 60  },
]

const mockStaff = [
  { id: '00000000-0000-0000-0000-000000000010', name: 'Aisha Malik' },
  { id: '00000000-0000-0000-0000-000000000011', name: 'Rania Khalid' },
  { id: '00000000-0000-0000-0000-000000000012', name: 'Sunita Rao' },
]

// Maps staff id → service ids they can perform
const staffServices: Record<string, string[]> = {
  '00000000-0000-0000-0000-000000000010': [  // Aisha: hair
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000022',
    '00000000-0000-0000-0000-000000000023',
    '00000000-0000-0000-0000-000000000024',
  ],
  '00000000-0000-0000-0000-000000000011': [  // Rania: nails
    '00000000-0000-0000-0000-000000000025',
    '00000000-0000-0000-0000-000000000026',
    '00000000-0000-0000-0000-000000000027',
  ],
  '00000000-0000-0000-0000-000000000012': [  // Sunita: skin & beauty
    '00000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000028',
    '00000000-0000-0000-0000-000000000029',
    '00000000-0000-0000-0000-000000000030',
  ],
}

// ── Time slots ────────────────────────────────────────────────────────────────

const TIME_SLOTS: string[] = []
for (let h = 9; h <= 20; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`)
  if (h < 20) TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr() {
  // Dubai local date (UTC+4) — avoids Intl API inconsistencies
  return new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function dubaiNowStr(): string {
  // Current Dubai time as "HH:MM"
  const d = new Date(Date.now() + 4 * 60 * 60 * 1000)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

function nextDubaiSlot(): string {
  // Next 30-min slot strictly after current Dubai time
  // e.g. 17:16 → 17:30 | 17:31 → 18:00 | 17:30 → 18:00
  const d = new Date(Date.now() + 4 * 60 * 60 * 1000)
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes()
  const next = Math.ceil((mins + 1) / 30) * 30
  const h = Math.floor(next / 60)
  const m = next % 60
  if (h < 9) return '09:00'
  if (h > 20 || (h === 20 && m > 0)) return '20:00'
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  const eh = Math.floor(total / 60) % 24
  const em = total % 60
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ServiceRow {
  rowId: string
  serviceId: string
  staffId: string
}

// ── Styles ────────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.04em',
  display: 'block', marginBottom: 6,
}

const inputStyle: React.CSSProperties = {
  width: '100%', fontSize: 13, color: '#000000',
  border: '0.5px solid #e0e0e0', borderRadius: 6,
  padding: '8px 10px', outline: 'none',
  backgroundColor: '#ffffff', boxSizing: 'border-box',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle, appearance: 'none', cursor: 'pointer',
}

// Cell select: no external border (table cell provides context)
const cellSelectStyle: React.CSSProperties = {
  width: '100%', fontSize: 12, color: '#000000',
  border: 'none', outline: 'none', backgroundColor: 'transparent',
  padding: '0 4px', cursor: 'pointer', appearance: 'none',
}

// ── Client search ─────────────────────────────────────────────────────────────

function ClientSearch({
  value, onChange,
}: {
  value: typeof mockClients[0] | null
  onChange: (c: typeof mockClients[0] | null) => void
}) {
  const [query, setQuery] = useState(value?.name ?? '')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const filtered = query.trim().length > 0
    ? mockClients.filter(c =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.phone.includes(query)
      )
    : mockClients

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  useEffect(() => { setQuery(value?.name ?? '') }, [value])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        type="text"
        placeholder="Search by name or phone…"
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(null); setOpen(true) }}
        onFocus={() => setOpen(true)}
        style={inputStyle}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          backgroundColor: '#ffffff', border: '0.5px solid #e0e0e0',
          borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          maxHeight: 200, overflowY: 'auto', marginTop: 2,
        }}>
          {filtered.map(c => (
            <div
              key={c.id}
              onMouseDown={() => { onChange(c); setQuery(c.name); setOpen(false) }}
              style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: '0.5px solid #f0f0f0' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f9fafb')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#ffffff')}
            >
              <span style={{ fontSize: 13, color: '#000000', fontWeight: 500 }}>{c.name}</span>
              <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 8 }}>{c.phone}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Summary detail row ────────────────────────────────────────────────────────

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0' }}>
      <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
      <span style={{ fontSize: 12, color: '#000000', fontWeight: 500, textAlign: 'right', maxWidth: '65%' }}>{value}</span>
    </div>
  )
}

// ── Row ID counter ────────────────────────────────────────────────────────────

let _rowCounter = 1
function nextRowId() { return `r${++_rowCounter}` }

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NewAppointment() {
  const navigate = useNavigate()
  const staffRecord = useAuthStore(s => s.staffRecord)

  const [client, setClient] = useState<typeof mockClients[0] | null>(null)
  const [date, setDate] = useState(todayStr())
  const [time, setTime] = useState(() => nextDubaiSlot())
  const [isWalkIn, setIsWalkIn] = useState(false)
  const [notes, setNotes] = useState('')
  const [serviceRows, setServiceRows] = useState<ServiceRow[]>([
    { rowId: 'r1', serviceId: '', staffId: '' },
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Derived values ──────────────────────────────────────────────────────────

  const completeRows = serviceRows.filter(r => r.serviceId && r.staffId)

  const totalDuration = serviceRows.reduce((sum, r) => {
    return sum + (mockServices.find(s => s.id === r.serviceId)?.duration ?? 0)
  }, 0)

  const endTime = totalDuration > 0 ? addMinutes(time, totalDuration) : null

  const totalPrice = serviceRows.reduce((sum, r) => {
    return sum + (mockServices.find(s => s.id === r.serviceId)?.price ?? 0)
  }, 0)

  const canBook = !!client && !!date && !!time && completeRows.length > 0

  // ── Row operations ──────────────────────────────────────────────────────────

  function addRow() {
    setServiceRows(prev => [...prev, { rowId: nextRowId(), serviceId: '', staffId: '' }])
  }

  function removeRow(rowId: string) {
    if (serviceRows.length <= 1) return
    setServiceRows(prev => prev.filter(r => r.rowId !== rowId))
  }

  function updateRow(rowId: string, field: 'serviceId' | 'staffId', value: string) {
    setServiceRows(prev => prev.map(r => {
      if (r.rowId !== rowId) return r
      if (field === 'serviceId') {
        const staffStillValid = value && r.staffId && staffServices[r.staffId]?.includes(value)
        return { ...r, serviceId: value, staffId: staffStillValid ? r.staffId : '' }
      }
      return { ...r, staffId: value }
    }))
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleBook = async () => {
    if (!canBook || !client) return
    if (date < todayStr()) {
      setError('Cannot book appointments for past dates')
      return
    }
    setSaving(true)
    setError(null)

    try {
      const startsAt = `${date}T${time}:00+04:00`
      const endsAt = endTime ? `${date}T${endTime}:00+04:00` : startsAt
      const firstStaff = completeRows[0].staffId
      const salonId = staffRecord?.salon_id ?? null

      const apptPayload = {
        salon_id: salonId,
        client_id: client.id,
        staff_id: firstStaff,
        starts_at: startsAt,
        ends_at: endsAt,
        is_walk_in: isWalkIn,
        notes: notes.trim() || null,
      }
      const { data: appt, error: apptErr } = await supabase
        .from('appointments')
        .insert(apptPayload)
        .select('id')
        .single()

      if (apptErr) {
        setError(apptErr.message)
        return
      }

      const svcPayload = completeRows.map(r => {
        const svc = mockServices.find(s => s.id === r.serviceId)
        return {
          appointment_id: appt.id,
          service_id: r.serviceId,
          staff_id: r.staffId,
          price: svc?.price ?? null,
          commission_pct: 0,
        }
      })
      const { error: svcErr } = await supabase
        .from('appointment_services')
        .insert(svcPayload)

      if (svcErr) {
        setError(svcErr.message)
        return
      }

      navigate('/appointments')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', display: 'flex', flexDirection: 'column' }}>

      <Topbar />

      <div style={{ marginTop: 52, flex: 1, padding: '20px 16px 32px' }}>

        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button
            onClick={() => navigate('/appointments')}
            style={{
              background: 'none', border: '0.5px solid #034325',
              color: '#034325', borderRadius: 6, padding: '4px 12px',
              fontSize: 12, cursor: 'pointer', fontWeight: 500,
            }}
          >
            ← Back
          </button>
          <span style={{ fontSize: 12, color: '#6b7280' }}>Dashboard › New appointment</span>
        </div>

        {/* Two-column layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>

          {/* ── Left: Form ── */}
          <div style={{
            backgroundColor: '#ffffff', border: '0.5px solid #e0e0e0',
            borderRadius: 8, padding: 20,
            display: 'flex', flexDirection: 'column', gap: 18,
          }}>

            {/* Client */}
            <div>
              <label style={labelStyle}>Client</label>
              <ClientSearch value={client} onChange={setClient} />
            </div>

            {/* Date + Start time — above services table */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Date</label>
                <input
                  type="date"
                  value={date}
                  min={todayStr()}
                  onChange={e => {
                    const d = e.target.value
                    setDate(d)
                    setTime(d === todayStr() ? nextDubaiSlot() : '09:00')
                  }}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Start time</label>
                <select
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  style={selectStyle}
                >
                  {(date === todayStr()
                    ? TIME_SLOTS.filter(t => t > dubaiNowStr())
                    : TIME_SLOTS
                  ).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Services table */}
            <div>
              <label style={labelStyle}>Services</label>
              <div style={{ border: '0.5px solid #e0e0e0', borderRadius: 8, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f9fafb' }}>
                      <th style={{
                        textAlign: 'left', fontSize: 11, color: '#6b7280',
                        padding: '8px 12px', fontWeight: 500,
                      }}>
                        Service
                      </th>
                      <th style={{
                        textAlign: 'left', fontSize: 11, color: '#6b7280',
                        padding: '8px 12px', fontWeight: 500,
                      }}>
                        Staff
                      </th>
                      <th style={{ width: 36, padding: '8px 8px' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {serviceRows.map((row, idx) => {
                      const eligibleStaff = row.serviceId
                        ? mockStaff.filter(s => staffServices[s.id]?.includes(row.serviceId))
                        : []
                      return (
                        <tr
                          key={row.rowId}
                          style={{ borderTop: idx === 0 ? '0.5px solid #e0e0e0' : '0.5px solid #f0f0f0' }}
                        >
                          <td style={{ padding: '8px 12px' }}>
                            <select
                              value={row.serviceId}
                              onChange={e => updateRow(row.rowId, 'serviceId', e.target.value)}
                              style={{
                                ...cellSelectStyle,
                                color: row.serviceId ? '#000000' : '#9ca3af',
                              }}
                            >
                              <option value="">Select service…</option>
                              {mockServices.map(s => (
                                <option key={s.id} value={s.id}>
                                  {s.name} — AED {s.price}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td style={{ padding: '8px 12px', borderLeft: '0.5px solid #f0f0f0' }}>
                            <select
                              value={row.staffId}
                              onChange={e => updateRow(row.rowId, 'staffId', e.target.value)}
                              disabled={!row.serviceId}
                              style={{
                                ...cellSelectStyle,
                                color: row.staffId ? '#000000' : '#9ca3af',
                                cursor: !row.serviceId ? 'not-allowed' : 'pointer',
                              }}
                            >
                              <option value="">
                                {row.serviceId ? 'Select staff…' : '—'}
                              </option>
                              {eligibleStaff.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          </td>
                          <td style={{
                            padding: '8px 8px', borderLeft: '0.5px solid #f0f0f0',
                            textAlign: 'center',
                          }}>
                            <button
                              onClick={() => removeRow(row.rowId)}
                              disabled={serviceRows.length <= 1}
                              style={{
                                background: 'none', border: 'none',
                                fontSize: 16, lineHeight: 1,
                                color: serviceRows.length <= 1 ? '#e0e0e0' : '#9ca3af',
                                cursor: serviceRows.length <= 1 ? 'default' : 'pointer',
                                padding: '0 4px',
                              }}
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Add service button */}
              <button
                onClick={addRow}
                style={{
                  marginTop: 8,
                  background: 'transparent', border: '0.5px solid #034325',
                  color: '#034325', borderRadius: 6, padding: '5px 14px',
                  fontSize: 12, cursor: 'pointer',
                }}
              >
                + Add service
              </button>
            </div>

            {/* Walk-in toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                id="walkIn"
                checked={isWalkIn}
                onChange={e => setIsWalkIn(e.target.checked)}
                style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#034325' }}
              />
              <label htmlFor="walkIn" style={{ fontSize: 13, color: '#000000', cursor: 'pointer', userSelect: 'none' }}>
                Walk-in
              </label>
            </div>

            {/* Notes */}
            <div>
              <label style={labelStyle}>Notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Any special requests or notes…"
                rows={3}
                style={{
                  ...inputStyle,
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  lineHeight: 1.5,
                }}
              />
            </div>

          </div>

          {/* ── Right: Booking summary ── */}
          <div style={{
            backgroundColor: '#ffffff', border: '0.5px solid #e0e0e0',
            borderRadius: 8, padding: 20,
          }}>
            <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 600, color: '#034325' }}>
              Booking Summary
            </p>

            {/* Meta rows */}
            <div style={{ borderTop: '0.5px solid #f0f0f0', paddingTop: 10 }}>
              <SummaryRow label="Client"     value={client?.name ?? '—'} />
              <SummaryRow label="Date"       value={date || '—'} />
              <SummaryRow label="Start time" value={time || '—'} />
              <SummaryRow label="End time"   value={endTime ?? '—'} />
            </div>

            {/* Per-service lines */}
            {completeRows.length > 0 && (
              <div style={{ borderTop: '0.5px solid #f0f0f0', marginTop: 10, paddingTop: 10 }}>
                {completeRows.map(r => {
                  const svc = mockServices.find(s => s.id === r.serviceId)!
                  const staff = mockStaff.find(s => s.id === r.staffId)!
                  const firstName = staff.name.split(' ')[0]
                  return (
                    <div
                      key={r.rowId}
                      style={{
                        display: 'flex', justifyContent: 'space-between',
                        alignItems: 'baseline', padding: '4px 0',
                      }}
                    >
                      <span style={{ fontSize: 12, color: '#000000' }}>
                        {svc.name}
                        <span style={{ color: '#6b7280' }}> · {firstName}</span>
                      </span>
                      <span style={{ fontSize: 12, color: '#000000', fontWeight: 500 }}>
                        AED {svc.price}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Total */}
            <div style={{ borderTop: '0.5px solid #e0e0e0', marginTop: 12, paddingTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#000000' }}>Total</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#034325' }}>
                  AED {totalPrice > 0 ? totalPrice.toFixed(2) : '0.00'}
                </span>
              </div>
            </div>

            {error && (
              <p style={{ fontSize: 11, color: '#dc2626', margin: '10px 0 0' }}>{error}</p>
            )}

            <button
              onClick={handleBook}
              disabled={!canBook || saving}
              style={{
                marginTop: 16, width: '100%',
                backgroundColor: canBook ? '#034325' : '#e0e0e0',
                color: canBook ? '#ffffff' : '#9ca3af',
                border: 'none', borderRadius: 6,
                padding: '10px 0', fontSize: 13, fontWeight: 600,
                cursor: canBook ? 'pointer' : 'not-allowed',
              }}
            >
              {saving ? 'Booking…' : 'Confirm booking'}
            </button>
          </div>

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
