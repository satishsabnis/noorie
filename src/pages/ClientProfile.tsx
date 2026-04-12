import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Topbar from '../components/Topbar'
import { supabase } from '../lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClientDetail {
  id: string
  name: string
  phone: string
  email: string
  dob: string
  allergies: string
  notes: string
  loyalty_points: number
}

interface FormState {
  name: string
  phone: string
  email: string
  dob: string
  allergies: string
  notes: string
}

interface VisitService {
  serviceName: string
  staffName: string
  price: number
}

interface VisitPayment {
  amount: number
  method: string
}

interface Visit {
  id: string
  starts_at: string
  ends_at: string
  status: string
  services: VisitService[]
  payments: VisitPayment[]
  totalPaid: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', year: 'numeric',
  })
}

function fmtMonthYear(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    timeZone: 'Asia/Dubai', month: 'long', year: 'numeric',
  })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function initials(name: string) {
  const parts = name.trim().split(' ').filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return (parts[0][0] ?? '?').toUpperCase()
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase()
}

// ── Styles ────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', fontSize: 13, color: '#000000',
  border: '0.5px solid #e0e0e0', borderRadius: 6,
  padding: '7px 10px', outline: 'none',
  backgroundColor: '#ffffff', boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.04em',
  display: 'block', marginBottom: 5,
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styleMap: Record<string, React.CSSProperties> = {
    completed:   { backgroundColor: '#034325', color: '#ffffff' },
    in_progress: { backgroundColor: '#f0fdf4', color: '#034325', border: '0.5px solid #d1fae5' },
    scheduled:   { backgroundColor: '#f9fafb', color: '#6b7280', border: '0.5px solid #e0e0e0' },
    no_show:     { backgroundColor: '#fee2e2', color: '#991b1b' },
    cancelled:   { backgroundColor: '#f3f4f6', color: '#6b7280' },
  }
  const labels: Record<string, string> = {
    completed: 'Completed', in_progress: 'In progress',
    scheduled: 'Scheduled', no_show: 'No show', cancelled: 'Cancelled',
  }
  return (
    <span style={{
      fontSize: 10, padding: '2px 8px', borderRadius: 4,
      fontWeight: 600, whiteSpace: 'nowrap',
      ...(styleMap[status] ?? styleMap.scheduled),
    }}>
      {labels[status] ?? status}
    </span>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ClientProfile() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [client,   setClient]   = useState<ClientDetail | null>(null)
  const [visits,   setVisits]   = useState<Visit[]>([])
  const [loading,  setLoading]  = useState(true)
  const [fetchErr, setFetchErr] = useState<string | null>(null)

  const [form,     setForm]     = useState<FormState>({ name: '', phone: '', email: '', dob: '', allergies: '', notes: '' })
  const [original, setOriginal] = useState<FormState>({ name: '', phone: '', email: '', dob: '', allergies: '', notes: '' })
  const [saving,   setSaving]   = useState(false)
  const [saveErr,  setSaveErr]  = useState<string | null>(null)

  const isDirty = JSON.stringify(form) !== JSON.stringify(original)

  // ── Fetch ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return
    let cancelled = false

    async function fetchData() {
      // Q1: client
      const { data: cd, error: ce } = await supabase
        .from('clients')
        .select('id, name, phone, email, dob, allergies, notes, loyalty_points')
        .eq('id', id)
        .single()

      if (ce || !cd) {
        if (!cancelled) { setFetchErr(ce?.message ?? 'Client not found'); setLoading(false) }
        return
      }

      const c: ClientDetail = {
        id:             cd.id as string,
        name:           (cd.name as string) ?? '',
        phone:          (cd.phone as string) ?? '',
        email:          (cd.email as string) ?? '',
        dob:            (cd.dob as string) ?? '',
        allergies:      (cd.allergies as string) ?? '',
        notes:          (cd.notes as string) ?? '',
        loyalty_points: (cd.loyalty_points as number) ?? 0,
      }
      const fv: FormState = { name: c.name, phone: c.phone, email: c.email, dob: c.dob, allergies: c.allergies, notes: c.notes }

      // Q2: appointments for client (desc)
      const { data: apptData } = await supabase
        .from('appointments')
        .select('id, starts_at, ends_at, status')
        .eq('client_id', id)
        .order('starts_at', { ascending: false })

      const apptIds = (apptData ?? []).map(a => a.id as string)

      // Q3: appointment_services + services + staff
      const { data: svcData } = apptIds.length > 0
        ? await supabase
            .from('appointment_services')
            .select('appointment_id, price, services ( name ), staff ( name )')
            .in('appointment_id', apptIds)
        : { data: [] as null }

      // Q4: payments
      const { data: payData } = apptIds.length > 0
        ? await supabase
            .from('payments')
            .select('appointment_id, amount, method')
            .in('appointment_id', apptIds)
        : { data: [] as null }

      // Build service map
      const svcMap: Record<string, VisitService[]> = {}
      for (const s of svcData ?? []) {
        const aid = s.appointment_id as string
        if (!svcMap[aid]) svcMap[aid] = []
        svcMap[aid].push({
          serviceName: (s.services as { name: string } | null)?.name ?? '—',
          staffName:   (s.staff    as { name: string } | null)?.name ?? '—',
          price:       (s.price    as number) ?? 0,
        })
      }

      // Build payment map
      const payMap: Record<string, VisitPayment[]> = {}
      for (const p of payData ?? []) {
        const aid = p.appointment_id as string
        if (!payMap[aid]) payMap[aid] = []
        payMap[aid].push({ amount: (p.amount as number) ?? 0, method: (p.method as string) ?? '' })
      }

      const mappedVisits: Visit[] = (apptData ?? []).map(a => {
        const pmts = payMap[a.id as string] ?? []
        return {
          id:        a.id as string,
          starts_at: a.starts_at as string,
          ends_at:   (a.ends_at as string) ?? '',
          status:    (a.status as string) ?? 'scheduled',
          services:  svcMap[a.id as string] ?? [],
          payments:  pmts,
          totalPaid: pmts.reduce((s, p) => s + p.amount, 0),
        }
      })

      if (!cancelled) {
        setClient(c)
        setForm(fv)
        setOriginal(fv)
        setVisits(mappedVisits)
        setLoading(false)
      }
    }

    fetchData()
    return () => { cancelled = true }
  }, [id])

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!client) return
    setSaving(true)
    setSaveErr(null)
    const { error } = await supabase
      .from('clients')
      .update({
        name:      form.name.trim(),
        phone:     form.phone.trim() || null,
        email:     form.email.trim() || null,
        dob:       form.dob || null,
        allergies: form.allergies.trim() || null,
        notes:     form.notes.trim() || null,
      })
      .eq('id', client.id)
    if (error) { setSaveErr(error.message); setSaving(false); return }
    setOriginal({ ...form })
    setClient(prev => prev ? { ...prev, ...form } : prev)
    setSaving(false)
  }

  // ── Derived stats ─────────────────────────────────────────────────────────

  const completedVisits = visits.filter(v => v.status === 'completed')
  const totalSpend      = visits.reduce((s, v) => s + v.totalPaid, 0)
  const lastVisit       = completedVisits.length > 0 ? completedVisits[0].starts_at : null
  const avgSpend        = completedVisits.length > 0 ? totalSpend / completedVisits.length : 0
  // visits are desc — earliest is last element
  const clientSince     = visits.length > 0 ? visits[visits.length - 1].starts_at : null

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', display: 'flex', flexDirection: 'column' }}>
      <Topbar />

      <div style={{ marginTop: 52, flex: 1, padding: '20px 16px 32px' }}>

        {/* Back + breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button
            onClick={() => navigate('/clients')}
            style={{
              background: 'transparent', border: '0.5px solid #034325',
              color: '#034325', borderRadius: 6, padding: '4px 12px',
              fontSize: 12, cursor: 'pointer', fontWeight: 500,
            }}
          >
            ← Back
          </button>
          <span style={{ color: '#6b7280', fontSize: 12 }}>
            Clients › {client?.name ?? '…'}
          </span>
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', padding: 40, color: '#6b7280', fontSize: 12, margin: 0 }}>Loading…</p>
        ) : fetchErr ? (
          <p style={{ textAlign: 'center', padding: 40, color: '#991b1b', fontSize: 12, margin: 0 }}>{fetchErr}</p>
        ) : !client ? null : (

          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, alignItems: 'start' }}>

            {/* ── LEFT COLUMN ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Header card */}
              <div style={{ backgroundColor: '#034325', borderRadius: 10, padding: '16px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%',
                    backgroundColor: '#00BF00',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: '#034325' }}>{initials(client.name)}</span>
                  </div>
                  <span style={{
                    backgroundColor: '#C9A227', color: '#1A1A1A',
                    fontSize: 10, fontWeight: 700, padding: '3px 10px',
                    borderRadius: 10, whiteSpace: 'nowrap',
                  }}>
                    {client.loyalty_points} pts
                  </span>
                </div>
                <p style={{ color: '#ffffff', fontSize: 16, fontWeight: 500, margin: '0 0 4px', lineHeight: 1.3 }}>
                  {client.name}
                </p>
                <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, margin: 0 }}>
                  {clientSince ? `Client since ${fmtMonthYear(clientSince)}` : 'No visits yet'}
                </p>
              </div>

              {/* Editable details card */}
              <div style={{
                backgroundColor: '#ffffff', border: '0.5px solid #e0e0e0',
                borderRadius: 8, padding: 16,
                display: 'flex', flexDirection: 'column', gap: 12,
              }}>
                <div>
                  <label style={labelStyle}>Name</label>
                  <input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Phone</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    style={inputStyle}
                    placeholder="—"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    style={inputStyle}
                    placeholder="—"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Date of birth</label>
                  <input
                    type="date"
                    value={form.dob}
                    onChange={e => setForm(f => ({ ...f, dob: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ ...labelStyle, color: '#991b1b' }}>Allergies</label>
                  <input
                    value={form.allergies}
                    onChange={e => setForm(f => ({ ...f, allergies: e.target.value }))}
                    style={{ ...inputStyle, border: '0.5px solid #991b1b' }}
                    placeholder="None known"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    rows={3}
                    style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                    placeholder="Any notes…"
                  />
                </div>
                {saveErr && <p style={{ fontSize: 11, color: '#991b1b', margin: 0 }}>{saveErr}</p>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleSave}
                    disabled={!isDirty || saving}
                    style={{
                      flex: 1,
                      backgroundColor: isDirty ? '#034325' : '#e0e0e0',
                      color: isDirty ? '#ffffff' : '#9ca3af',
                      border: 'none', borderRadius: 6, padding: '8px 0',
                      fontSize: 12, fontWeight: 600,
                      cursor: isDirty ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => { setForm({ ...original }); setSaveErr(null) }}
                    disabled={!isDirty}
                    style={{
                      flex: 1, backgroundColor: 'transparent',
                      color: isDirty ? '#6b7280' : '#9ca3af',
                      border: `0.5px solid ${isDirty ? '#d1d5db' : '#e0e0e0'}`,
                      borderRadius: 6, padding: '8px 0', fontSize: 12,
                      cursor: isDirty ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>

              {/* Stats grid 2×2 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Total visits', value: completedVisits.length.toString() },
                  { label: 'Total spend',  value: `AED ${totalSpend.toFixed(2)}` },
                  { label: 'Last visit',   value: fmtDate(lastVisit) },
                  { label: 'Avg spend',    value: `AED ${avgSpend.toFixed(2)}` },
                ].map(s => (
                  <div key={s.label} style={{ backgroundColor: '#ffffff', border: '0.5px solid #e0e0e0', borderRadius: 8, padding: '10px 12px' }}>
                    <p style={{
                      fontSize: 10, color: '#6b7280', margin: '0 0 4px',
                      fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>
                      {s.label}
                    </p>
                    <p style={{ fontSize: 14, fontWeight: 500, color: '#034325', margin: 0 }}>{s.value}</p>
                  </div>
                ))}
              </div>

            </div>

            {/* ── RIGHT COLUMN: Visit history ── */}
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#034325', margin: '0 0 12px' }}>Visit history</p>

              {visits.length === 0 ? (
                <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>No visits yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {visits.map(v => (
                    <div
                      key={v.id}
                      onClick={() => navigate(`/appointment/${v.id}`)}
                      style={{
                        backgroundColor: '#ffffff', border: '0.5px solid #e0e0e0',
                        borderRadius: 8, padding: '12px 14px', cursor: 'pointer',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.border = '0.5px solid #034325')}
                      onMouseLeave={e => (e.currentTarget.style.border = '0.5px solid #e0e0e0')}
                    >
                      {/* Visit header: date + time range + status */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 500, color: '#000000' }}>
                          {fmtDate(v.starts_at)}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: '#6b7280' }}>
                            {fmtTime(v.starts_at)}{v.ends_at ? ` – ${fmtTime(v.ends_at)}` : ''}
                          </span>
                          <StatusBadge status={v.status} />
                        </div>
                      </div>

                      {/* Service rows */}
                      {v.services.map((s, i) => (
                        <div
                          key={i}
                          style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                            padding: '4px 0',
                            borderTop: i === 0 ? '0.5px solid #f0f0f0' : 'none',
                          }}
                        >
                          <span style={{ fontSize: 12, color: '#000000' }}>{s.serviceName}</span>
                          <span style={{ fontSize: 11, color: '#6b7280' }}>
                            {s.staffName} · AED {s.price.toFixed(2)}
                          </span>
                        </div>
                      ))}

                      {/* Payment summary */}
                      {v.payments.length > 0 && (
                        <div style={{
                          marginTop: 8, paddingTop: 8, borderTop: '0.5px solid #f0f0f0',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                          <span style={{ fontSize: 11, color: '#6b7280' }}>
                            Paid · {[...new Set(v.payments.map(p => p.method === 'cash' ? 'Cash' : 'Card'))].join(' + ')}
                          </span>
                          <span style={{ fontSize: 12, color: '#034325', fontWeight: 500 }}>
                            AED {v.totalPaid.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', padding: '10px 0 14px' }}>
        <p style={{ color: '#9ca3af', fontSize: 10, margin: 0 }}>Powered by Blue Flute Consulting LLC-FZ</p>
      </div>
    </div>
  )
}
