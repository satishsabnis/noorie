import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, Routes, Route } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { signInWithMobile, getStaffByUserId } from '../lib/auth'
import { useAuthStore } from '../stores/authStore'
import { useSalonTimezone, salonOffsetStr } from '../hooks/useSalonTimezone'
import { Toast } from '../components/Toast'
import { useAppointmentSubscription } from '../hooks/useAppointmentSubscription'
import ProductSaleModal from '../components/ProductSaleModal'

// -- Types --
interface Appointment {
  id: string
  starts_at: string
  ends_at: string
  status: string
  clientName: string
  services: { name: string; price: number }[]
  totalPrice: number
  totalPaid: number
  balance: number
}

const STAFF_COUNTRY_CODES = [
  { flag: '🇦🇪', code: '+971' },
  { flag: '🇮🇳', code: '+91' },
  { flag: '🇬🇧', code: '+44' },
  { flag: '🇺🇸', code: '+1' },
]

// -- Helpers --
function dubaiTime(iso: string, tz = 'Asia/Dubai') {
  return new Date(iso).toLocaleTimeString('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function todayStr(tz = 'Asia/Dubai') {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz })
}

// =============================================
// SCREEN 0: Staff Login
// =============================================
function StaffLogin({ salonId, salonName }: { salonId: string; salonName?: string }) {
  const navigate = useNavigate()
  const { slug } = useParams<{ slug: string }>()
  const { signIn } = useAuthStore()
  const [countryCode, setCountryCode] = useState('+971')
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState(['', '', '', '', ''])
  const pinRefs = useRef<(HTMLInputElement | null)[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handlePinChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return
    const next = [...pin]
    next[index] = value
    setPin(next)
    if (value && index < 4) pinRefs.current[index + 1]?.focus()
  }

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) pinRefs.current[index - 1]?.focus()
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const enteredPin = pin.join('')
    if (enteredPin.length < 5) {
      setError('Please enter your 5-digit PIN')
      return
    }
    if (!phone.trim()) {
      setError('Please enter your phone number')
      return
    }

    setLoading(true)
    try {
      const data = await signInWithMobile(countryCode, phone, enteredPin)
      const staffRec = await getStaffByUserId(data.user!.id)
      if (!staffRec) throw new Error('No staff record found for this account')
      signIn(data.user!, staffRec)
      navigate(`/${slug}/staff`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid phone or PIN')
    } finally {
      setLoading(false)
    }
  }

  const headerStyle: React.CSSProperties = {
    backgroundColor: '#034325',
    padding: '14px 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  }

  const pageStyle: React.CSSProperties = {
    minHeight: '100vh',
    backgroundColor: '#f9fafb',
    display: 'flex',
    flexDirection: 'column',
    maxWidth: 480,
    margin: '0 auto',
    width: '100%',
  }

  const pinBoxStyle: React.CSSProperties = {
    width: 48,
    height: 52,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 700,
    border: '1px solid #1D558F',
    borderRadius: 8,
    outline: 'none',
    backgroundColor: '#ffffff',
    color: '#034325',
    boxSizing: 'border-box',
  }

  return (
    <div style={{ ...pageStyle, backgroundColor: '#ffffff' }}>
      <div style={headerStyle}>
        <p style={{ color: '#ffffff', fontSize: 16, fontWeight: 600, margin: 0 }}>Staff Login</p>
        <div style={{ width: 60 }} />
      </div>

      {salonName && (
        <div style={{ backgroundColor: '#034325', padding: '16px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>
          <p style={{ color: '#ffffff', fontSize: 15, fontWeight: 600, margin: 0 }}>{salonName}</p>
        </div>
      )}

      <div style={{ flex: 1, padding: '32px 24px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
        <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <p style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, margin: '0 0 6px' }}>Mobile number</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                value={countryCode}
                onChange={e => setCountryCode(e.target.value)}
                style={{ border: '1px solid #1D558F', borderRadius: 8, outline: 'none', backgroundColor: '#f9f9f9', fontSize: 13, padding: '0 8px', height: 44, cursor: 'pointer', flexShrink: 0 }}
              >
                {STAFF_COUNTRY_CODES.map(c => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.code}
                  </option>
                ))}
              </select>
              <input
                type="tel"
                placeholder="50 123 4567"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                required
                style={{ flex: 1, backgroundColor: '#ffffff', color: '#000000', border: '1px solid #1D558F', borderRadius: 8, padding: '11px 14px', fontSize: 14, outline: 'none' }}
              />
            </div>
          </div>

          <div>
            <p style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, margin: '0 0 10px' }}>5-digit PIN</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              {pin.map((digit, i) => (
                <input
                  key={i}
                  ref={el => {
                    pinRefs.current[i] = el
                  }}
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => handlePinChange(i, e.target.value)}
                  onKeyDown={e => handlePinKeyDown(i, e)}
                  style={pinBoxStyle}
                />
              ))}
            </div>
          </div>

          {error && <p style={{ fontSize: 13, color: '#991b1b', margin: 0 }}>{error}</p>}

          <button
            type="submit"
            disabled={loading}
            style={{ backgroundColor: '#034325', color: '#ffffff', border: 'none', borderRadius: 8, padding: 13, fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, width: '100%' }}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

// -- Shared styles --
const pageStyle: React.CSSProperties = {
  minHeight: '100vh', backgroundColor: '#f9fafb',
  display: 'flex', flexDirection: 'column', maxWidth: 480, margin: '0 auto',
}

const headerStyle: React.CSSProperties = {
  backgroundColor: '#034325', padding: '14px 16px',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
}

const backBtn: React.CSSProperties = {
  background: 'none', border: '1px solid rgba(255,255,255,0.4)',
  color: '#ffffff', borderRadius: 6, padding: '4px 12px',
  fontSize: 13, cursor: 'pointer', fontWeight: 500,
}

const cardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff', borderRadius: 10,
  border: '0.5px solid #e0e0e0', margin: '12px 16px',
  overflow: 'hidden',
}

// -- Status badge --
function Badge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    scheduled:   { bg: '#f9fafb', color: '#6b7280', label: 'Scheduled' },
    in_progress: { bg: '#d1fae5', color: '#034325', label: 'In progress' },
    completed:   { bg: '#034325', color: '#ffffff', label: 'Completed' },
    no_show:     { bg: '#fee2e2', color: '#991b1b', label: 'No show' },
  }
  const s = map[status] ?? map.scheduled
  return (
    <span style={{
      backgroundColor: s.bg, color: s.color,
      fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
    }}>
      {s.label}
    </span>
  )
}

// =============================================
// SCREEN 1: My Schedule
// =============================================
function StaffSchedule() {
  const navigate = useNavigate()
  const { slug } = useParams<{ slug: string }>()
  const { staffRecord, signOut } = useAuthStore()
  const { tz } = useSalonTimezone()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [earnings, setEarnings] = useState(0)
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; appointmentId: string; timestamp: number }>>([])
  const [showProductSales, setShowProductSales] = useState(false)
  const [saleSuccess, setSaleSuccess] = useState(false)
  const [staffList, setStaffList] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    if (!staffRecord?.id) return
    fetchSchedule()
  }, [staffRecord?.id])

  useEffect(() => {
    if (!staffRecord?.id || !slug) return

    const verifySalon = async () => {
      const { data: salon } = await supabase
        .from('salons')
        .select('id')
        .eq('slug', slug)
        .single()

      if (!salon || salon.id !== staffRecord.salon_id) {
        navigate('/')
      }
    }

    verifySalon()
  }, [staffRecord?.id, slug, staffRecord?.salon_id, navigate])

  useAppointmentSubscription(
    (toast) => {
      setToasts(prev => [...prev, toast])
    },
    !!slug
  )

  async function fetchSchedule() {
    const today = todayStr(tz)
    const staffId = staffRecord!.id

    const { data: appts } = await supabase
      .from('appointments')
      .select('id, starts_at, ends_at, status, clients(name)')
      .eq('salon_id', staffRecord!.salon_id)
      .eq('staff_id', staffId)
      .gte('starts_at', `${today}T00:00:00${salonOffsetStr(tz)}`)
      .lt('starts_at', `${today}T23:59:59${salonOffsetStr(tz)}`)
      .order('starts_at', { ascending: true })

    if (!appts || appts.length === 0) { setLoading(false); return }

    const apptIds = appts.map(a => a.id)

    const [{ data: svcRows }, { data: payRows }] = await Promise.all([
      supabase.from('appointment_services')
        .select('appointment_id, price, services(name)')
        .in('appointment_id', apptIds),
      supabase.from('payments')
        .select('appointment_id, amount')
        .in('appointment_id', apptIds),
    ])

    const svcMap: Record<string, { name: string; price: number }[]> = {}
    for (const r of svcRows ?? []) {
      const aid = r.appointment_id as string
      if (!svcMap[aid]) svcMap[aid] = []
      svcMap[aid].push({
        name: (r.services as unknown as { name: string } | null)?.name ?? '—',
        price: (r.price as number) ?? 0,
      })
    }

    const payMap: Record<string, number> = {}
    for (const r of payRows ?? []) {
      const aid = r.appointment_id as string
      payMap[aid] = (payMap[aid] ?? 0) + ((r.amount as number) ?? 0)
    }

    const merged: Appointment[] = appts.map(a => {
      const services = svcMap[a.id] ?? []
      const totalPrice = services.reduce((s, sv) => s + sv.price, 0)
      const totalPaid = Math.round((payMap[a.id] ?? 0) * 100) / 100
      return {
        id: a.id as string,
        starts_at: a.starts_at as string,
        ends_at: a.ends_at as string,
        status: a.status as string,
        clientName: (a.clients as unknown as { name: string } | null)?.name ?? 'Client',
        services,
        totalPrice,
        totalPaid,
        balance: Math.max(0, Math.round((totalPrice - totalPaid) * 100) / 100),
      }
    })

    const todayEarnings = merged
      .filter(a => a.status === 'completed')
      .reduce((s, a) => s + a.totalPaid, 0)

    setAppointments(merged)
    setEarnings(Math.round(todayEarnings * 100) / 100)
    setLoading(false)
  }

  useEffect(() => {
    const salonId = staffRecord?.salon_id
    if (!salonId) return
    supabase.from('staff').select('id, name').eq('salon_id', salonId)
      .eq('status', 'active').neq('role', 'owner').order('name')
      .then(({ data }) => setStaffList((data ?? []) as { id: string; name: string }[]))
  }, [staffRecord?.salon_id])

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  const firstName = staffRecord?.name?.split(' ')[0] ?? 'Staff'

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div>
          <p style={{ color: '#00BF00', fontSize: 11, margin: 0 }}>Noorie Staff</p>
          <p style={{ color: '#ffffff', fontSize: 16, fontWeight: 600, margin: 0 }}>{firstName}</p>
        </div>
        <button onClick={signOut} style={{ ...backBtn, fontSize: 12 }}>Sign out</button>
      </div>

      {/* Earnings strip */}
      <div style={{ backgroundColor: '#034325', padding: '0 16px 14px' }}>
        <div style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, margin: 0 }}>My earnings today</p>
          <p style={{ color: '#ffffff', fontSize: 18, fontWeight: 600, margin: 0 }}>AED {earnings.toFixed(2)}</p>
        </div>
      </div>

      {/* Schedule */}
      <div style={{ flex: 1, padding: '8px 0 24px' }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', margin: '12px 16px 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Today's schedule
        </p>

        {loading ? (
          <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '32px 0' }}>Loading...</p>
        ) : appointments.length === 0 ? (
          <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '32px 0' }}>No appointments today.</p>
        ) : (
          appointments.map(appt => (
            <div
              key={appt.id}
              onClick={() => navigate(`/${slug}/staff/appointment/${appt.id}`)}
              style={{ ...cardStyle, cursor: 'pointer' }}
            >
              {/* Time + status row */}
              <div style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '0.5px solid #f0f0f0' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#034325', margin: 0 }}>{dubaiTime(appt.starts_at, tz)}</p>
                  <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>→ {dubaiTime(appt.ends_at, tz)}</p>
                </div>
                <Badge status={appt.status} />
              </div>

              {/* Client + services */}
              <div style={{ padding: '10px 14px' }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#111111', margin: '0 0 4px' }}>{appt.clientName}</p>
                {appt.services.map((s, i) => (
                  <p key={i} style={{ fontSize: 12, color: '#6b7280', margin: '1px 0' }}>{s.name}</p>
                ))}
                {appt.balance > 0 && (
                  <p style={{ fontSize: 12, color: '#991b1b', fontWeight: 600, margin: '6px 0 0' }}>
                    Balance due: AED {appt.balance.toFixed(2)}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Record product sale button */}
      <div style={{ padding: '0 16px 16px' }}>
        <button
          onClick={() => setShowProductSales(true)}
          style={{ width: '100%', padding: '11px 0', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer', backgroundColor: 'transparent', color: '#034325', border: '1.5px solid #034325' }}
        >Record product sale</button>
      </div>

      {toasts.map(toast => (
        <Toast
          key={toast.id}
          id={toast.id}
          message={toast.message}
          onDismiss={() => dismissToast(toast.id)}
        />
      ))}

      {saleSuccess && (
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 300, backgroundColor: '#fff', border: '1.5px solid #034325', borderRadius: 8, padding: '12px 20px', fontSize: 13, fontWeight: 600, color: '#034325', whiteSpace: 'nowrap', boxShadow: '0 2px 12px rgba(0,0,0,0.12)' }}>
          Sale recorded
        </div>
      )}

      {showProductSales && (
        <ProductSaleModal
          salonId={staffRecord?.salon_id ?? ''}
          staffList={staffList}
          onClose={() => setShowProductSales(false)}
          onSuccess={() => { setSaleSuccess(true); setTimeout(() => setSaleSuccess(false), 3000) }}
        />
      )}

      <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
        <p style={{ color: '#9ca3af', fontSize: 10, margin: 0 }}>Powered by Blue Flute Consulting LLC-FZ</p>
      </div>
    </div>
  )
}

// =============================================
// SCREEN 2: Appointment Detail
// =============================================
function StaffAppointmentDetail() {
  const { id, slug } = useParams<{ id: string; slug: string }>()
  const navigate = useNavigate()
  const { tz } = useSalonTimezone()
  const [appt, setAppt] = useState<Appointment | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { if (id) fetchAppt() }, [id])

  async function fetchAppt() {
    const { data: a } = await supabase
      .from('appointments')
      .select('id, starts_at, ends_at, status, clients(name)')
      .eq('id', id!)
      .single()

    if (!a) { setLoading(false); return }

    const [{ data: svcRows }, { data: payRows }] = await Promise.all([
      supabase.from('appointment_services').select('price, services(name)').eq('appointment_id', id!),
      supabase.from('payments').select('amount').eq('appointment_id', id!),
    ])

    const services = (svcRows ?? []).map(r => ({
      name: (r.services as unknown as { name: string } | null)?.name ?? '—',
      price: (r.price as number) ?? 0,
    }))
    const totalPrice = services.reduce((s, sv) => s + sv.price, 0)
    const totalPaid = Math.round((payRows ?? []).reduce((s, r) => s + ((r.amount as number) ?? 0), 0) * 100) / 100

    setAppt({
      id: a.id as string,
      starts_at: a.starts_at as string,
      ends_at: a.ends_at as string,
      status: a.status as string,
      clientName: (a.clients as unknown as { name: string } | null)?.name ?? 'Client',
      services,
      totalPrice,
      totalPaid,
      balance: Math.max(0, Math.round((totalPrice - totalPaid) * 100) / 100),
    })
    setLoading(false)
  }

  async function updateStatus(newStatus: string) {
    setUpdating(true)
    setError(null)
    const { error: err } = await supabase
      .from('appointments')
      .update({ status: newStatus })
      .eq('id', id!)
    if (err) { setError(err.message); setUpdating(false); return }
    setAppt(prev => prev ? { ...prev, status: newStatus } : null)
    setUpdating(false)
  }

  if (loading) return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <p style={{ color: '#ffffff', fontSize: 16, fontWeight: 600, margin: 0 }}>Appointment</p>
      </div>
      <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '32px 0' }}>Loading...</p>
    </div>
  )

  if (!appt) return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <button onClick={() => navigate(`/${slug}/staff`)} style={backBtn}>Back</button>
        <p style={{ color: '#ffffff', fontSize: 16, fontWeight: 600, margin: 0 }}>Appointment</p>
        <div style={{ width: 60 }} />
      </div>
      <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '32px 0' }}>Appointment not found.</p>
    </div>
  )

  const canStart = appt.status === 'scheduled'
  const canComplete = appt.status === 'in_progress'
  const canCollect = appt.status === 'completed' && appt.balance > 0

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <button onClick={() => navigate(`/${slug}/staff`)} style={backBtn}>Back</button>
        <p style={{ color: '#ffffff', fontSize: 16, fontWeight: 600, margin: 0 }}>Appointment</p>
        <Badge status={appt.status} />
      </div>

      {/* Client + time */}
      <div style={{ ...cardStyle }}>
        <div style={{ padding: '14px 16px', borderBottom: '0.5px solid #f0f0f0' }}>
          <p style={{ fontSize: 18, fontWeight: 700, color: '#111111', margin: '0 0 4px' }}>{appt.clientName}</p>
          <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>{dubaiTime(appt.starts_at, tz)} → {dubaiTime(appt.ends_at, tz)}</p>
        </div>

        {/* Services */}
        <div style={{ padding: '12px 16px' }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>Services</p>
          {appt.services.map((s, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: i < appt.services.length - 1 ? '0.5px solid #f5f5f5' : 'none' }}>
              <span style={{ fontSize: 13, color: '#111111' }}>{s.name}</span>
              <span style={{ fontSize: 13, color: '#6b7280' }}>AED {s.price.toFixed(2)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0', borderTop: '0.5px solid #e0e0e0', marginTop: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#111111' }}>Total</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#034325' }}>AED {appt.totalPrice.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Payment status */}
      {appt.status === 'completed' && (
        <div style={{ ...cardStyle }}>
          <div style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13, color: '#6b7280' }}>Paid</span>
              <span style={{ fontSize: 13, color: '#034325', fontWeight: 600 }}>AED {appt.totalPaid.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: appt.balance > 0 ? '#991b1b' : '#6b7280' }}>Balance</span>
              <span style={{ fontSize: 13, color: appt.balance > 0 ? '#991b1b' : '#034325', fontWeight: 600 }}>
                AED {appt.balance.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}

      {error && <p style={{ fontSize: 12, color: '#991b1b', margin: '0 16px' }}>{error}</p>}

      {/* Actions */}
      <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {canStart && (
          <button
            onClick={() => updateStatus('in_progress')}
            disabled={updating}
            style={{ backgroundColor: '#034325', color: '#ffffff', border: 'none', borderRadius: 10, padding: '14px', fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: updating ? 0.7 : 1 }}
          >
            {updating ? 'Updating...' : 'Start appointment'}
          </button>
        )}
        {canComplete && (
          <button
            onClick={() => updateStatus('completed')}
            disabled={updating}
            style={{ backgroundColor: '#034325', color: '#ffffff', border: 'none', borderRadius: 10, padding: '14px', fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: updating ? 0.7 : 1 }}
          >
            {updating ? 'Updating...' : 'Mark as completed'}
          </button>
        )}
        {canCollect && (
          <button
            onClick={() => navigate(`/${slug}/staff/appointment/${id}/payment`)}
            style={{ backgroundColor: '#C9A227', color: '#1A1A1A', border: 'none', borderRadius: 10, padding: '14px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
          >
            Collect payment — AED {appt.balance.toFixed(2)}
          </button>
        )}
        {appt.status === 'completed' && appt.balance === 0 && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <p style={{ fontSize: 13, color: '#034325', fontWeight: 600, margin: 0 }}>Fully paid</p>
          </div>
        )}
      </div>
    </div>
  )
}

// =============================================
// SCREEN 3: Collect Payment
// =============================================
function StaffCollectPayment() {
  const { id, slug } = useParams<{ id: string; slug: string }>()
  const navigate = useNavigate()
  const salonId = useAuthStore(s => s.staffRecord?.salon_id ?? null)
  const [balance, setBalance] = useState(0)
  const [clientName, setClientName] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<'cash' | 'card'>('cash')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (id) fetchBalance() }, [id])

  async function fetchBalance() {
    const { data: a } = await supabase
      .from('appointments')
      .select('clients(name)')
      .eq('id', id!)
      .single()

    const [{ data: svcRows }, { data: payRows }] = await Promise.all([
      supabase.from('appointment_services').select('price').eq('appointment_id', id!),
      supabase.from('payments').select('amount').eq('appointment_id', id!),
    ])

    const total = (svcRows ?? []).reduce((s, r) => s + ((r.price as number) ?? 0), 0)
    const paid = (payRows ?? []).reduce((s, r) => s + ((r.amount as number) ?? 0), 0)
    const bal = Math.max(0, Math.round((total - paid) * 100) / 100)

    setBalance(bal)
    setAmount(bal.toFixed(2))
    setClientName((a?.clients as unknown as { name: string } | null)?.name ?? 'Client')
    setLoading(false)
  }

  async function handleSubmit() {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return }
    if (amt > balance + 0.01) { setError(`Amount cannot exceed balance of AED ${balance.toFixed(2)}`); return }

    setSaving(true)
    setError(null)

    const { error: err } = await supabase.from('payments').insert({
      salon_id: salonId,
      appointment_id: id,
      amount: amt,
      method,
      status: 'completed',
    })

    if (err) { setError(err.message); setSaving(false); return }

    navigate(`/${slug}/staff/appointment/${id}`)
  }

  if (loading) return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <p style={{ color: '#ffffff', fontSize: 16, fontWeight: 600, margin: 0 }}>Collect Payment</p>
      </div>
      <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '32px 0' }}>Loading...</p>
    </div>
  )

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <button onClick={() => navigate(`/${slug}/staff/appointment/${id}`)} style={backBtn}>Back</button>
        <p style={{ color: '#ffffff', fontSize: 16, fontWeight: 600, margin: 0 }}>Collect Payment</p>
        <div style={{ width: 60 }} />
      </div>

      {/* Client + balance */}
      <div style={{ ...cardStyle }}>
        <div style={{ padding: '14px 16px' }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#111111', margin: '0 0 4px' }}>{clientName}</p>
          <p style={{ fontSize: 13, color: '#991b1b', fontWeight: 600, margin: 0 }}>Balance due: AED {balance.toFixed(2)}</p>
        </div>
      </div>

      {/* Payment form */}
      <div style={{ ...cardStyle }}>
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Amount */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>Amount (AED)</p>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              step="0.01"
              min="0"
              style={{ width: '100%', fontSize: 22, fontWeight: 700, color: '#034325', border: '1px solid #e0e0e0', borderRadius: 8, padding: '12px 14px', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Method */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>Payment method</p>
            <div style={{ display: 'flex', gap: 10 }}>
              {(['cash', 'card'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  style={{
                    flex: 1, padding: '12px', fontSize: 14, fontWeight: 600, borderRadius: 8, cursor: 'pointer', border: 'none',
                    backgroundColor: method === m ? '#034325' : '#f9fafb',
                    color: method === m ? '#ffffff' : '#6b7280',
                  }}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {error && <p style={{ fontSize: 12, color: '#991b1b', margin: 0 }}>{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{ backgroundColor: '#C9A227', color: '#1A1A1A', border: 'none', borderRadius: 10, padding: '14px', fontSize: 15, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Processing...' : 'Confirm payment'}
          </button>
        </div>
      </div>
    </div>
  )
}

// =============================================
// Router wrapper with auth check
// =============================================
export default function StaffApp() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { isAuthenticated, staffRecord, isLoading } = useAuthStore()
  const [salon, setSalon] = useState<{ id: string; name: string } | null>(null)
  const [salonLoading, setSalonLoading] = useState(true)

  useEffect(() => {
    const fetchSalon = async () => {
      if (!slug) return
      const { data } = await supabase
        .from('salons')
        .select('id, name')
        .eq('slug', slug)
        .maybeSingle()
      setSalon(data)
      setSalonLoading(false)
    }
    fetchSalon()
  }, [slug])

  if (isLoading || salonLoading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', maxWidth: 480, margin: '0 auto' }}>
        <p style={{ fontSize: 13, color: '#9ca3af' }}>Loading...</p>
      </div>
    )
  }

  if (!isAuthenticated || !staffRecord) {
    return <StaffLogin salonId={salon?.id ?? ''} salonName={salon?.name} />
  }

  if (staffRecord.salon_id !== salon?.id) {
    navigate(`/${slug}/staff`)
    return <StaffLogin salonId={salon?.id ?? ''} salonName={salon?.name} />
  }

  return (
    <Routes>
      <Route path="/" element={<StaffSchedule />} />
      <Route path="/appointment/:id" element={<StaffAppointmentDetail />} />
      <Route path="/appointment/:id/payment" element={<StaffCollectPayment />} />
    </Routes>
  )
}
