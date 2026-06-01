import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Topbar from '../components/Topbar'
import { supabase } from '../lib/supabase'
import { useSalonTimezone } from '../hooks/useSalonTimezone'

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

function fmtDate(iso: string | null, tz = 'Asia/Dubai') {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    timeZone: tz, day: 'numeric', month: 'short', year: 'numeric',
  })
}

function fmtMonthYear(iso: string, tz = 'Asia/Dubai') {
  return new Date(iso).toLocaleDateString('en-GB', {
    timeZone: tz, month: 'long', year: 'numeric',
  })
}

function fmtTime(iso: string, tz = 'Asia/Dubai') {
  return new Date(iso).toLocaleTimeString('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function initials(name: string) {
  const parts = name.trim().split(' ').filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return (parts[0][0] ?? '?').toUpperCase()
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase()
}

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

export default function ClientProfile() {
  const { id, slug } = useParams<{ id: string; slug?: string }>()
  const navigate = useNavigate()
  const { tz } = useSalonTimezone()

  const [client, setClient] = useState<ClientDetail | null>(null)
  const [visits, setVisits] = useState<Visit[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchErr, setFetchErr] = useState<string | null>(null)

  const [form, setForm] = useState<FormState>({ name: '', phone: '', email: '', dob: '', allergies: '', notes: '' })
  const [original, setOriginal] = useState<FormState>({ name: '', phone: '', email: '', dob: '', allergies: '', notes: '' })
  const [pin, setPin] = useState<string[]>(['', '', '', '', ''])
  const [originalPin, setOriginalPin] = useState('')
  const pinRefs = useRef<(HTMLInputElement | null)[]>([])
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'loyalty' | 'blindbox'>('overview')
  const [ledger, setLedger] = useState<Array<{id: string; type: string; points: number; reason: string; reference_id: string | null; created_at: string}>>([])
  const [bbRewards, setBbRewards] = useState<Array<{id: string; status: string; bb_fee_paid: number; catalogue_price: number; discounted_price: number; expires_at: string; created_at: string; services: {name: string} | null; blind_box_campaigns: {name: string} | null}>>([])

  const isDirty = JSON.stringify(form) !== JSON.stringify(original) || pin.join('') !== originalPin

  const handleCopyLink = () => {
    const url = `noorie-salon.vercel.app/${slug}/client`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  useEffect(() => {
    if (!id) return
    let cancelled = false

    async function fetchData() {
      const { data: cd, error: ce } = await supabase
        .from('clients')
        .select('id, name, phone, email, dob, allergies, notes, loyalty_points, pin')
        .eq('id', id)
        .single()

      if (ce || !cd) {
        if (!cancelled) { setFetchErr(ce?.message ?? 'Client not found'); setLoading(false) }
        return
      }

      const c: ClientDetail = {
        id: cd.id as string,
        name: (cd.name as string) ?? '',
        phone: (cd.phone as string) ?? '',
        email: (cd.email as string) ?? '',
        dob: (cd.dob as string) ?? '',
        allergies: (cd.allergies as string) ?? '',
        notes: (cd.notes as string) ?? '',
        loyalty_points: (cd.loyalty_points as number) ?? 0,
      }
      const fv: FormState = { name: c.name, phone: c.phone, email: c.email, dob: c.dob, allergies: c.allergies, notes: c.notes }

      const { data: apptData } = await supabase
        .from('appointments')
        .select('id, starts_at, ends_at, status')
        .eq('client_id', id)
        .order('starts_at', { ascending: false })

      const apptIds = (apptData ?? []).map(a => a.id as string)

      let svcData: any[] = []
      if (apptIds.length > 0) {
        const result = await supabase
          .from('appointment_services')
          .select('appointment_id, price, services ( name ), staff ( name )')
          .in('appointment_id', apptIds)
        svcData = result.data ?? []
      }

      let payData: any[] = []
      if (apptIds.length > 0) {
        const result = await supabase
          .from('payments')
          .select('appointment_id, amount, method')
          .in('appointment_id', apptIds)
        payData = result.data ?? []
      }

      const svcMap: Record<string, VisitService[]> = {}
      for (const s of svcData) {
        const aid = s.appointment_id as string
        if (!svcMap[aid]) svcMap[aid] = []
        
        let serviceName = '—'
        const servicesData = s.services
        if (Array.isArray(servicesData) && servicesData.length > 0) {
          serviceName = servicesData[0]?.name ?? '—'
        } else if (servicesData && !Array.isArray(servicesData)) {
          serviceName = servicesData.name ?? '—'
        }
        
        let staffName = '—'
        const staffData = s.staff
        if (Array.isArray(staffData) && staffData.length > 0) {
          staffName = staffData[0]?.name ?? '—'
        } else if (staffData && !Array.isArray(staffData)) {
          staffName = staffData.name ?? '—'
        }
        
        svcMap[aid].push({
          serviceName: serviceName,
          staffName: staffName,
          price: (s.price as number) ?? 0,
        })
      }

      const payMap: Record<string, VisitPayment[]> = {}
      for (const p of payData) {
        const aid = p.appointment_id as string
        if (!payMap[aid]) payMap[aid] = []
        payMap[aid].push({ amount: (p.amount as number) ?? 0, method: (p.method as string) ?? '' })
      }

      const mappedVisits: Visit[] = (apptData ?? []).map(a => {
        const pmts = payMap[a.id as string] ?? []
        return {
          id: a.id as string,
          starts_at: a.starts_at as string,
          ends_at: (a.ends_at as string) ?? '',
          status: (a.status as string) ?? 'scheduled',
          services: svcMap[a.id as string] ?? [],
          payments: pmts,
          totalPaid: pmts.reduce((s, p) => s + p.amount, 0),
        }
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const storedPin: string = (cd as any).pin ?? ''
      const pinDigits = storedPin ? storedPin.split('') : ['', '', '', '', '']

      const { data: ledgerData } = await supabase
        .from('loyalty_points_ledger')
        .select('id, type, points, reason, reference_id, created_at')
        .eq('client_id', id)
        .order('created_at', { ascending: false })
        .limit(50)
      if (ledgerData) setLedger(ledgerData)

      const { data: bbData } = await supabase
        .from('blind_box_rewards')
        .select('id, status, bb_fee_paid, catalogue_price, discounted_price, expires_at, created_at, services(name), blind_box_campaigns(name)')
        .eq('client_id', id)
        .order('created_at', { ascending: false })
      if (bbData) setBbRewards(bbData as any)

      if (!cancelled) {
        setClient(c)
        setForm(fv)
        setOriginal(fv)
        setPin(pinDigits)
        setOriginalPin(storedPin)
        setVisits(mappedVisits)
        setLoading(false)
      }
    }

    fetchData()
    return () => { cancelled = true }
  }, [id])

  async function handleSave() {
    if (!client) return
    setSaving(true)
    setSaveErr(null)
    const newPin = pin.join('')
    const { error } = await supabase
      .from('clients')
      .update({
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        dob: form.dob || null,
        allergies: form.allergies.trim() || null,
        notes: form.notes.trim() || null,
        pin: newPin || null,
      })
      .eq('id', client.id)
    if (error) { setSaveErr(error.message); setSaving(false); return }
    setOriginal({ ...form })
    setOriginalPin(newPin)
    setClient(prev => prev ? { ...prev, ...form } : prev)
    setSaving(false)

    if (newPin.length === 5 && newPin !== originalPin) {
      supabase.auth.getSession().then(({ data }) => {
        fetch('https://eoxgaawoyftjnjkmjbmk.supabase.co/functions/v1/create-client-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${data.session?.access_token}`
          },
          body: JSON.stringify({
            clientId: client.id,
            phone: form.phone.trim(),
            pin: newPin
          })
        }).catch(err => console.error('create-client-user failed:', err))
      })
    }
  }

  const completedVisits = visits.filter(v => v.status === 'completed')
  const totalSpend = visits.reduce((s, v) => s + v.totalPaid, 0)
  const lastVisit = completedVisits.length > 0 ? completedVisits[0].starts_at : null
  const avgSpend = completedVisits.length > 0 ? totalSpend / completedVisits.length : 0
  const clientSince = visits.length > 0 ? visits[visits.length - 1].starts_at : null

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', display: 'flex', flexDirection: 'column' }}>
      <Topbar />

      <div style={{ marginTop: 52, flex: 1, padding: '20px 16px 32px' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button
            onClick={() => navigate('/clients')}
            style={{
              background: 'transparent', border: '0.5px solid #034325',
              color: '#034325', borderRadius: 6, padding: '4px 12px',
              fontSize: 12, cursor: 'pointer', fontWeight: 500,
            }}
          >
            Back
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

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
                  {clientSince ? `Client since ${fmtMonthYear(clientSince, tz)}` : 'No visits yet'}
                </p>
              </div>

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
                <div>
                  <label style={labelStyle}>Client PIN</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {pin.map((digit, i) => (
                      <input
                        key={i}
                        ref={el => { pinRefs.current[i] = el }}
                        type="password"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={e => {
                          const val = e.target.value.replace(/\D/g, '')
                          const newPin = [...pin]
                          newPin[i] = val
                          setPin(newPin)
                          if (val && i < 4) pinRefs.current[i + 1]?.focus()
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Backspace' && !pin[i] && i > 0) {
                            pinRefs.current[i - 1]?.focus()
                          }
                        }}
                        style={{
                          width: 40, height: 40, textAlign: 'center', fontSize: 18, fontWeight: 700,
                          border: '0.5px solid #e0e0e0', borderRadius: 6, outline: 'none',
                          backgroundColor: '#ffffff', color: '#034325', boxSizing: 'border-box',
                        }}
                      />
                    ))}
                  </div>
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
                    onClick={() => { setForm({ ...original }); setPin(originalPin ? originalPin.split('') : ['', '', '', '', '']); setSaveErr(null) }}
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

              {slug && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
                  <label style={labelStyle}>Share with client:</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ flex: 1, backgroundColor: '#f9fafb', border: '0.5px solid #e0e0e0', borderRadius: 6, padding: '10px 12px', fontSize: 13, color: '#111111', wordBreak: 'break-all' }}>
                      noorie-salon.vercel.app/{slug}/client
                    </div>
                    <button
                      onClick={handleCopyLink}
                      style={{
                        backgroundColor: '#034325',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 6,
                        padding: '10px 14px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {copied ? '✓' : '📋'}
                    </button>
                  </div>
                  {copied && <p style={{ fontSize: 11, color: '#059669', margin: 0 }}>Copied!</p>}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Total visits', value: completedVisits.length.toString() },
                  { label: 'Total spend', value: `AED ${totalSpend.toFixed(2)}` },
                  { label: 'Last visit', value: fmtDate(lastVisit, tz) },
                  { label: 'Avg spend', value: `AED ${avgSpend.toFixed(2)}` },
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

            <div>
              <div style={{ display: 'flex', borderBottom: '1px solid #e0e0e0', marginBottom: 20 }}>
                {(['overview', 'loyalty', 'blindbox'] as const).map(tab => (
                  <div
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      fontSize: 13, padding: '10px 18px', cursor: 'pointer',
                      color: activeTab === tab ? '#034325' : '#888',
                      borderBottom: activeTab === tab ? '2px solid #034325' : '2px solid transparent',
                      fontWeight: activeTab === tab ? 500 : 400,
                    }}
                  >
                    {tab === 'overview' ? 'Visit history' : tab === 'loyalty' ? 'Loyalty' : 'Blind Box'}
                  </div>
                ))}
              </div>

              {activeTab === 'overview' && (
                <div>
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
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 500, color: '#000000' }}>
                              {fmtDate(v.starts_at, tz)}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 11, color: '#6b7280' }}>
                                {fmtTime(v.starts_at, tz)}{v.ends_at ? ` – ${fmtTime(v.ends_at, tz)}` : ''}
                              </span>
                              <StatusBadge status={v.status} />
                            </div>
                          </div>

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
              )}

              {activeTab === 'loyalty' && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                    <div style={{ border: '0.5px solid #e0e0e0', borderRadius: 8, padding: 14, textAlign: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 600, color: '#034325' }}>{client?.loyalty_points || 0}</div>
                      <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>Total points</div>
                    </div>
                    <div style={{ border: '0.5px solid #e0e0e0', borderRadius: 8, padding: 14, textAlign: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 600, color: '#185FA5' }}>
                        {(client?.loyalty_points || 0) >= 2000 ? 'Max' : (client?.loyalty_points || 0) >= 500 ? 'Pro' : 'Regular'}
                      </div>
                      <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>Current tier</div>
                    </div>
                    <div style={{ border: '0.5px solid #e0e0e0', borderRadius: 8, padding: 14, textAlign: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 600, color: '#854F0B' }}>
                        {(client?.loyalty_points || 0) >= 2000 ? '—' : (client?.loyalty_points || 0) >= 500 ? Math.max(0, 2000 - (client?.loyalty_points || 0)) : Math.max(0, 500 - (client?.loyalty_points || 0))}
                      </div>
                      <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>
                        {(client?.loyalty_points || 0) >= 2000 ? 'Max tier reached' : (client?.loyalty_points || 0) >= 500 ? 'Points to Max' : 'Points to Pro'}
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: 12, fontWeight: 500, color: '#034325', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>Points history</div>

                  {ledger.length === 0 && <div style={{ fontSize: 13, color: '#888' }}>No points recorded yet.</div>}

                  {ledger.map((row, idx) => {
                    const runningBalance = ledger.slice(idx).reduce((s, r) => s + r.points, 0)
                    const reasonLabel: Record<string, string> = {
                      service_payment: 'Service payment',
                      product_sale: 'Product purchase',
                      app_booking: 'App booking bonus',
                      pre_book: 'Pre-booked next visit',
                      off_peak: 'Off-peak booking bonus',
                      review: 'Left a review',
                      streak: 'Monthly streak bonus',
                      referral: 'Referral bonus',
                      redemption: 'Points redeemed',
                      expiry: 'Points expired',
                      adjustment: 'Manual adjustment',
                    }
                    const isRedeem = row.type === 'behaviour' ? false : row.reason === 'redemption' || row.reason === 'expiry'
                    const iconLabel = row.type === 'spend' ? 'SP' : row.type === 'behaviour' ? 'BP' : 'RD'
                    const iconBg = row.type === 'spend' ? '#e8f4ec' : row.type === 'behaviour' ? '#e6f1fb' : '#fcebeb'
                    const iconColor = row.type === 'spend' ? '#034325' : row.type === 'behaviour' ? '#185FA5' : '#991b1b'
                    return (
                      <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '0.5px solid #f0f0f0' }}>
                        <div style={{ width: 32, height: 32, borderRadius: 6, background: iconBg, color: iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>{iconLabel}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13 }}>{reasonLabel[row.reason] || row.reason}</div>
                          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{new Date(row.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: isRedeem ? '#991b1b' : '#034325' }}>{isRedeem ? '-' : '+'}{Math.abs(row.points)} pts</div>
                          <div style={{ fontSize: 11, color: '#888' }}>Balance: {runningBalance}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {activeTab === 'blindbox' && (
                <div>
                  {bbRewards.length === 0 && <div style={{ fontSize: 13, color: '#888' }}>No Blind Box rewards yet.</div>}
                  {bbRewards.map(r => {
                    const svc = r.services as { name: string } | null
                    const campaign = r.blind_box_campaigns as { name: string } | null
                    const statusLabel: Record<string, string> = { redeemed_now: 'Used in appointment', saved: 'Saved for next visit', redeemed_later: 'Redeemed later', expired: 'Expired unused' }
                    const statusColor: Record<string, { bg: string; color: string }> = {
                      redeemed_now: { bg: '#e6f1fb', color: '#185FA5' },
                      saved: { bg: '#e8f4ec', color: '#034325' },
                      redeemed_later: { bg: '#e6f1fb', color: '#185FA5' },
                      expired: { bg: '#fcebeb', color: '#991b1b' },
                    }
                    const sc = statusColor[r.status] || { bg: '#f0f0f0', color: '#888' }
                    const isExpired = r.status === 'expired'
                    const isSaved = r.status === 'saved'
                    const expiryDate = new Date(r.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                    const earnDate = new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                    return (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '0.5px solid #f0f0f0' }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: '#faeeda', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#854F0B', flexShrink: 0 }}>BB</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{svc?.name || 'Unknown service'}</div>
                          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{campaign?.name || ''} · Earned {earnDate}</div>
                          <span style={{ display: 'inline-block', fontSize: 10, padding: '2px 8px', borderRadius: 4, marginTop: 4, background: sc.bg, color: sc.color }}>{statusLabel[r.status] || r.status}</span>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 10, color: '#888' }}>{isSaved ? 'Expires' : isExpired ? 'Expired' : 'Was valid until'}</div>
                          <div style={{ fontSize: 12, fontWeight: 500, color: isSaved ? '#991b1b' : '#034325' }}>{expiryDate}</div>
                        </div>
                      </div>
                    )
                  })}
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