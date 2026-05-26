import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Topbar from '../components/Topbar'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useSalonTimezone, salonNowUTC, salonOffsetStr } from '../hooks/useSalonTimezone'

// -- Time slots --
const TIME_SLOTS: string[] = []
for (let h = 9; h <= 23; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`)
  if (h < 23) TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`)
}

// -- Helpers --
function todayStr(tz = 'Asia/Dubai') {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz })
}

function dubaiNowStr(tz = 'Asia/Dubai'): string {
  return new Date().toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
}

function nextDubaiSlot(tz = 'Asia/Dubai'): string {
  const timeStr = new Date().toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
  const [hh, mm] = timeStr.split(':').map(Number)
  const mins = hh * 60 + mm
  const next = Math.ceil((mins + 1) / 30) * 30
  const h = Math.floor(next / 60)
  const m = next % 60
  if (h < 9) return '09:00'
  if (h > 23 || (h === 23 && m > 0)) return '23:00'
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  const eh = Math.floor(total / 60) % 24
  const em = total % 60
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`
}

// -- Types --
interface Client {
  id: string
  name: string
  phone: string
}

interface DbService {
  id: string
  name: string
  duration_minutes: number
}

interface DbStaff {
  id: string
  name: string
  service_ids: string[]
}

interface ServiceRow {
  rowId: string
  serviceId: string
  staffId: string
}

// -- Styles --
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

const cellSelectStyle: React.CSSProperties = {
  width: '100%', fontSize: 12, color: '#000000',
  border: 'none', outline: 'none', backgroundColor: 'transparent',
  padding: '0 4px', cursor: 'pointer', appearance: 'none',
}

// -- Client search --
function ClientSearch({
  value, onChange, salonId, clients,
}: {
  value: Client | null
  onChange: (c: Client | null) => void
  salonId: string | null
  clients: Client[]
}) {
  const [query, setQuery] = useState(value?.name ?? '')
  const [open, setOpen] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newDob, setNewDob] = useState('')
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const filtered = query.trim().length > 0
    ? clients.filter(c =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.phone.includes(query)
      )
    : clients

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  useEffect(() => { setQuery(value?.name ?? '') }, [value])

  function handleAddClientClick() {
    setOpen(false)
    setShowAddForm(true)
    setNewName('')
    setNewPhone('')
    setNewDob('')
    setAddError(null)
  }

  async function handleSaveClient() {
    if (!newName.trim()) { setAddError('Name is required'); return }
    setAddSaving(true)
    setAddError(null)
    const { data, error } = await supabase
      .from('clients')
      .insert({ salon_id: salonId, name: newName.trim(), phone: newPhone.trim() || null, dob: newDob || null })
      .select('id, name, phone')
      .single()
    if (error || !data) {
      setAddError(error?.message ?? 'Failed to save client')
      setAddSaving(false)
      return
    }
    const saved: Client = { id: data.id as string, name: data.name as string, phone: (data.phone as string) ?? '' }
    onChange(saved)
    setShowAddForm(false)
    setAddSaving(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        type="text"
        placeholder="Search by name or phone..."
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(null); setOpen(true) }}
        onFocus={() => setOpen(true)}
        style={inputStyle}
        autoComplete="off"
      />

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          backgroundColor: '#ffffff', border: '0.5px solid #e0e0e0',
          borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          maxHeight: 220, overflowY: 'auto', marginTop: 2,
        }}>
          <div
            onMouseDown={handleAddClientClick}
            style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: '0.5px solid #e0e0e0' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f0fdf4')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#ffffff')}
          >
            <span style={{ fontSize: 13, color: '#034325', fontWeight: 500 }}>+ Add Client</span>
          </div>
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

      {showAddForm && (
        <div style={{
          marginTop: 8, border: '0.5px solid #e0e0e0', borderRadius: 6,
          padding: '12px 12px 10px', backgroundColor: '#f9fafb',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <input type="text" placeholder="Full name" value={newName} onChange={e => setNewName(e.target.value)} style={inputStyle} autoFocus />
          <input type="tel" placeholder="Mobile number" value={newPhone} onChange={e => setNewPhone(e.target.value)} style={inputStyle} />
          <div>
            <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>Date of birth</label>
            <input type="date" value={newDob} onChange={e => setNewDob(e.target.value)} style={inputStyle} />
          </div>
          {addError && <p style={{ fontSize: 11, color: '#dc2626', margin: 0 }}>{addError}</p>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
            <button
              onClick={handleSaveClient}
              disabled={addSaving}
              style={{
                backgroundColor: '#034325', color: '#ffffff', border: 'none',
                borderRadius: 6, padding: '7px 16px', fontSize: 12, fontWeight: 600,
                cursor: addSaving ? 'not-allowed' : 'pointer',
              }}
            >
              {addSaving ? 'Saving...' : 'Save client'}
            </button>
            <span onClick={() => setShowAddForm(false)} style={{ fontSize: 12, color: '#6b7280', cursor: 'pointer', textDecoration: 'underline' }}>
              Cancel
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// -- Summary row --
function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0' }}>
      <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
      <span style={{ fontSize: 12, color: '#000000', fontWeight: 500, textAlign: 'right', maxWidth: '65%' }}>{value}</span>
    </div>
  )
}

let _rowCounter = 1
function nextRowId() { return `r${++_rowCounter}` }

// -- Page --
export default function NewAppointment() {
  const navigate = useNavigate()
  const staffRecord = useAuthStore(s => s.staffRecord)
  const { tz } = useSalonTimezone()

  const [client, setClient] = useState<Client | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [dbServices, setDbServices] = useState<DbService[]>([])
  const [dbStaff, setDbStaff] = useState<DbStaff[]>([])
  const [date, setDate] = useState(todayStr())
  const [time, setTime] = useState(() => nextDubaiSlot())
  const [notes, setNotes] = useState('')
  const [serviceRows, setServiceRows] = useState<ServiceRow[]>([
    { rowId: 'r1', serviceId: '', staffId: '' },
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)

  useEffect(() => {
    const salonId = staffRecord?.salon_id
    if (!salonId) return

    // Fetch clients
    supabase
      .from('clients')
      .select('id, name, phone')
      .eq('salon_id', salonId)
      .order('name', { ascending: true })
      .then(({ data }) => {
        if (data) setClients(data.map(c => ({ id: c.id as string, name: c.name as string, phone: (c.phone as string) ?? '' })))
      })

    // Fetch services
    supabase
      .from('services')
      .select('id, name, duration_minutes')
      .eq('salon_id', salonId)
      .eq('is_active', true)
      .order('name', { ascending: true })
      .then(({ data }) => {
        if (data) setDbServices(data as DbService[])
      })

    // Fetch staff with their services
    supabase
      .from('staff')
      .select('id, name, staff_services(service_id)')
      .eq('salon_id', salonId)
      .eq('is_active', true)
      .neq('role', 'owner')
      .order('name', { ascending: true })
      .then(({ data }) => {
        if (data) setDbStaff(data.map(s => ({
          id: s.id as string,
          name: s.name as string,
          service_ids: ((s.staff_services as { service_id: string }[]) ?? []).map(ss => ss.service_id),
        })))
      })
  }, [staffRecord?.salon_id])

  const completeRows = serviceRows.filter(r => r.serviceId && r.staffId)

  const totalDuration = serviceRows.reduce((sum, r) => {
    return sum + (dbServices.find(s => s.id === r.serviceId)?.duration_minutes ?? 0)
  }, 0)

  const endTime = totalDuration > 0 ? addMinutes(time, totalDuration) : null
  const canBook = !!client && !!date && !!time && completeRows.length > 0

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
        const staffStillValid = value && r.staffId && dbStaff.find(s => s.id === r.staffId)?.service_ids.includes(value)
        return { ...r, serviceId: value, staffId: staffStillValid ? r.staffId : '' }
      }
      return { ...r, staffId: value }
    }))
  }

  const doBook = async () => {
    try {
      setSaving(true)
      setError(null)

      const startsAt = `${date}T${time}:00${salonOffsetStr(tz)}`
      const endsAt = endTime ? `${date}T${endTime}:00${salonOffsetStr(tz)}` : startsAt
      const uniqueStaff = [...new Set(completeRows.map(r => r.staffId))]
      const apptStaffId = uniqueStaff.length === 1 ? uniqueStaff[0] : null
      const salonId = staffRecord?.salon_id ?? null

      const { data: appt, error: apptErr } = await supabase
        .from('appointments')
        .insert({
          salon_id: salonId,
          client_id: client!.id,
          staff_id: apptStaffId,
          starts_at: startsAt,
          ends_at: endsAt,
          is_walk_in: false,
          notes: notes.trim() || null,
        })
        .select('id')
        .single()

      if (apptErr) { setError(apptErr.message); return }

      const { error: svcErr } = await supabase
        .from('appointment_services')
        .insert(completeRows.map(r => ({
          appointment_id: appt.id,
          service_id: r.serviceId,
          staff_id: r.staffId,
          price: 0,
          commission_pct: 0,
        })))

      if (svcErr) { setError(svcErr.message); return }

      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setSaving(false)
    }
  }

  const handleBook = async () => {
    if (!canBook || !client) return
    if (date < todayStr(tz)) {
      setError('Cannot book appointments for past dates')
      return
    }
    setError(null)

    const salonId = staffRecord?.salon_id ?? null
    const offset = salonOffsetStr(tz)
    const { data: existing } = await supabase
      .from('appointments')
      .select('id')
      .eq('salon_id', salonId)
      .eq('client_id', client.id)
      .gte('starts_at', `${date}T00:00:00${offset}`)
      .lte('starts_at', `${date}T23:59:59${offset}`)
      .neq('status', 'cancelled')
      .limit(1)

    if (existing && existing.length > 0) {
      setShowDuplicateModal(true)
      return
    }

    await doBook()
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', display: 'flex', flexDirection: 'column' }}>
      <Topbar />

      {/* Duplicate appointment modal */}
      {showDuplicateModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 12, maxWidth: 380, width: '90%', padding: 24 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#111', margin: '0 0 10px' }}>Duplicate appointment</p>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 20px' }}>
              This client already has an appointment on this date. Do you want to continue or go back to edit?
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setShowDuplicateModal(false); doBook() }}
                style={{ backgroundColor: '#034325', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', flex: 1 }}
              >
                Continue
              </button>
              <button
                onClick={() => setShowDuplicateModal(false)}
                style={{ backgroundColor: 'transparent', color: '#034325', border: '0.5px solid #034325', borderRadius: 6, padding: '8px 18px', fontSize: 13, cursor: 'pointer' }}
              >
                Edit
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 52, flex: 1, padding: '20px 16px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button
            onClick={() => navigate('/appointments')}
            style={{
              background: 'none', border: '0.5px solid #034325',
              color: '#034325', borderRadius: 6, padding: '4px 12px',
              fontSize: 12, cursor: 'pointer', fontWeight: 500,
            }}
          >
            Back
          </button>
          <span style={{ fontSize: 12, color: '#6b7280' }}>Dashboard › New appointment</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>

          {/* Left: Form */}
          <div style={{
            backgroundColor: '#ffffff', border: '0.5px solid #e0e0e0',
            borderRadius: 8, padding: 20,
            display: 'flex', flexDirection: 'column', gap: 18,
          }}>
            <div>
              <label style={labelStyle}>Client</label>
              <ClientSearch value={client} onChange={setClient} salonId={staffRecord?.salon_id ?? null} clients={clients} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Date</label>
                <input
                  type="date"
                  value={date}
                  min="2024-07-01"
                  onChange={e => {
                    const d = e.target.value
                    setDate(d)
                    setTime(d === todayStr(tz) ? nextDubaiSlot(tz) : '09:00')
                  }}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Start time</label>
                <select value={time} onChange={e => setTime(e.target.value)} style={selectStyle}>
                  {(() => {
                    if (date !== todayStr(tz)) return TIME_SLOTS
                    const future = TIME_SLOTS.filter(t => t > dubaiNowStr(tz))
                    return future.length > 0 ? future : TIME_SLOTS
                  })().map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Services</label>
              {dbServices.length === 0 ? (
                <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>No services found. Add services in Admin first.</p>
              ) : (
                <>
                  <div style={{ border: '0.5px solid #e0e0e0', borderRadius: 8, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f9fafb' }}>
                          <th style={{ textAlign: 'left', fontSize: 11, color: '#6b7280', padding: '8px 12px', fontWeight: 500 }}>Service</th>
                          <th style={{ textAlign: 'left', fontSize: 11, color: '#6b7280', padding: '8px 12px', fontWeight: 500 }}>Staff</th>
                          <th style={{ width: 36, padding: '8px 8px' }} />
                        </tr>
                      </thead>
                      <tbody>
                        {serviceRows.map((row, idx) => {
                          const eligibleStaff = row.serviceId
                            ? dbStaff.filter(s => s.service_ids.includes(row.serviceId))
                            : []
                          return (
                            <tr key={row.rowId} style={{ borderTop: idx === 0 ? '0.5px solid #e0e0e0' : '0.5px solid #f0f0f0' }}>
                              <td style={{ padding: '8px 12px' }}>
                                <select
                                  value={row.serviceId}
                                  onChange={e => updateRow(row.rowId, 'serviceId', e.target.value)}
                                  style={{ ...cellSelectStyle, color: row.serviceId ? '#000000' : '#9ca3af' }}
                                >
                                  <option value="">Select service...</option>
                                  {dbServices.map(s => (
                                    <option key={s.id} value={s.id}>{s.name} — {s.duration_minutes} min</option>
                                  ))}
                                </select>
                              </td>
                              <td style={{ padding: '8px 12px', borderLeft: '0.5px solid #f0f0f0' }}>
                                <select
                                  value={row.staffId}
                                  onChange={e => updateRow(row.rowId, 'staffId', e.target.value)}
                                  disabled={!row.serviceId || eligibleStaff.length === 0}
                                  style={{
                                    ...cellSelectStyle,
                                    color: row.staffId ? '#000000' : '#9ca3af',
                                    cursor: !row.serviceId ? 'not-allowed' : 'pointer',
                                  }}
                                >
                                  <option value="">
                                    {!row.serviceId ? '—' : eligibleStaff.length === 0 ? 'No staff for this service' : 'Select staff...'}
                                  </option>
                                  {eligibleStaff.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                  ))}
                                </select>
                              </td>
                              <td style={{ padding: '8px 8px', borderLeft: '0.5px solid #f0f0f0', textAlign: 'center' }}>
                                <button
                                  onClick={() => removeRow(row.rowId)}
                                  disabled={serviceRows.length <= 1}
                                  style={{
                                    background: 'none', border: 'none', fontSize: 16, lineHeight: 1,
                                    color: serviceRows.length <= 1 ? '#e0e0e0' : '#9ca3af',
                                    cursor: serviceRows.length <= 1 ? 'default' : 'pointer', padding: '0 4px',
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
                  <button
                    onClick={addRow}
                    style={{
                      marginTop: 8, background: 'transparent', border: '0.5px solid #034325',
                      color: '#034325', borderRadius: 6, padding: '5px 14px', fontSize: 12, cursor: 'pointer',
                    }}
                  >
                    + Add service
                  </button>
                </>
              )}
            </div>

            <div>
              <label style={labelStyle}>Notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Any special requests or notes..."
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
              />
            </div>
          </div>

          {/* Right: Summary */}
          <div style={{ backgroundColor: '#ffffff', border: '0.5px solid #e0e0e0', borderRadius: 8, padding: 20 }}>
            <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 600, color: '#034325' }}>Booking Summary</p>
            <div style={{ borderTop: '0.5px solid #f0f0f0', paddingTop: 10 }}>
              <SummaryRow label="Client"     value={client?.name ?? '—'} />
              <SummaryRow label="Date"       value={date || '—'} />
              <SummaryRow label="Start time" value={time || '—'} />
              <SummaryRow label="End time"   value={endTime ?? '—'} />
            </div>

            {completeRows.length > 0 && (
              <div style={{ borderTop: '0.5px solid #f0f0f0', marginTop: 10, paddingTop: 10 }}>
                {completeRows.map(r => {
                  const svc = dbServices.find(s => s.id === r.serviceId)
                  const stf = dbStaff.find(s => s.id === r.staffId)
                  return (
                    <div key={r.rowId} style={{ padding: '4px 0' }}>
                      <span style={{ fontSize: 12, color: '#000000' }}>
                        {svc?.name}
                        <span style={{ color: '#6b7280' }}> · {stf?.name.split(' ')[0]}</span>
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {error && <p style={{ fontSize: 11, color: '#dc2626', margin: '10px 0 0' }}>{error}</p>}

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
              {saving ? 'Booking...' : 'Confirm booking'}
            </button>
          </div>

        </div>
      </div>

      <div style={{ textAlign: 'center', padding: '10px 0 14px' }}>
        <p style={{ color: '#9ca3af', fontSize: 10, margin: 0 }}>Powered by Blue Flute Consulting LLC-FZ</p>
      </div>
    </div>
  )
}
