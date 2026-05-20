import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const CLIENT_COUNTRY_CODES = [
  { flag: '🇦🇪', code: '+971' },
  { flag: '🇸🇦', code: '+966' },
  { flag: '🇰🇼', code: '+965' },
  { flag: '🇶🇦', code: '+974' },
  { flag: '🇧🇭', code: '+973' },
  { flag: '🇴🇲', code: '+968' },
  { flag: '🇮🇳', code: '+91'  },
  { flag: '🇬🇧', code: '+44'  },
  { flag: '🇺🇸', code: '+1'   },
]

const TIME_SLOTS = [
  '09:00','10:00','11:00','12:00','13:00',
  '14:00','15:00','16:00','17:00','18:00','19:00','20:00',
]

interface Salon {
  id: string
  name: string
  city: string | null
  country: string | null
}

interface Client {
  id: string
  name: string
  phone: string
}

interface Service {
  id: string
  name: string
  category: string | null
  duration_minutes: number
  price: number
  is_active: boolean
  commission_pct?: number
}

interface StaffMember {
  id: string
  name: string
  role: string
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface TimeSlot {
  time: string
}

type Screen = 'login' | 'home' | 'set-pin' | 'book-service' | 'book-datetime' | 'book-confirm'

function getTomorrow(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function initials(name: string): string {
  const parts = name.trim().split(' ').filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return (parts[0][0] ?? '?').toUpperCase()
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase()
}

const headerStyle: React.CSSProperties = {
  backgroundColor: '#034325',
  padding: '14px 16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexShrink: 0,
}

const screenWrap: React.CSSProperties = {
  minHeight: '100vh',
  backgroundColor: '#f9fafb',
  display: 'flex',
  flexDirection: 'column',
  maxWidth: 480,
  margin: '0 auto',
  width: '100%',
}

export default function ClientApp() {
  const { slug } = useParams<{ slug: string }>()

  const [salon, setSalon]               = useState<Salon | null>(null)
  const [salonLoading, setSalonLoading] = useState(true)
  const [salonNotFound, setSalonNotFound] = useState(false)

  const [countryCode, setCountryCode] = useState('+971')
  const [phone, setPhone]             = useState('')
  const [pin, setPin]                 = useState(['', '', '', '', ''])
  const pinRefs = useRef<(HTMLInputElement | null)[]>([])

  const [error, setError]               = useState('')
  const [loading, setLoading]           = useState(false)
  const [showOtpMessage, setShowOtpMessage] = useState(false)

  const [currentScreen, setCurrentScreen] = useState<Screen>('login')
  const [client, setClient]               = useState<Client | null>(null)

  const [services, setServices]               = useState<Service[]>([])
  const [staff, setStaff]                     = useState<StaffMember[]>([])
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [selectedDate, setSelectedDate]       = useState<string>('')
  const [selectedTime, setSelectedTime]       = useState<string>('')
  const [selectedStaff, setSelectedStaff]     = useState<StaffMember | null>(null)
  const [bookingRef, setBookingRef]           = useState<string>('')
  const [bookingLoading, setBookingLoading]   = useState(false)
  const [bookingError, setBookingError]       = useState('')
  const [menuOpen, setMenuOpen]               = useState(false)

  const [newPin, setNewPin]         = useState(['', '', '', '', ''])
  const [confirmPin, setConfirmPin] = useState(['', '', '', '', ''])
  const newPinRefs     = useRef<(HTMLInputElement | null)[]>([])
  const confirmPinRefs = useRef<(HTMLInputElement | null)[]>([])
  const [setPinError, setSetPinError]       = useState('')
  const [setPinLoading, setSetPinLoading]   = useState(false)

  useEffect(() => {
    if (!slug) return
    fetch('https://eoxgaawoyftjnjkmjbmk.supabase.co/functions/v1/get-salon-by-slug', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug })
    })
    .then(res => res.json())
    .then(data => {
      if (data && data.id) {
        setSalon(data as Salon)
      } else {
        setSalonNotFound(true)
      }
      setSalonLoading(false)
    })
    .catch(() => {
      setSalonNotFound(true)
      setSalonLoading(false)
    })
  }, [slug])

  const handlePinChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return
    const newPin = [...pin]
    newPin[index] = value
    setPin(newPin)
    if (value && index < 4) pinRefs.current[index + 1]?.focus()
  }

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) pinRefs.current[index - 1]?.focus()
  }

  const handleNewPinChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return
    const updated = [...newPin]
    updated[index] = value
    setNewPin(updated)
    if (value && index < 4) newPinRefs.current[index + 1]?.focus()
  }

  const handleNewPinKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !newPin[index] && index > 0) newPinRefs.current[index - 1]?.focus()
  }

  const handleConfirmPinChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return
    const updated = [...confirmPin]
    updated[index] = value
    setConfirmPin(updated)
    if (value && index < 4) confirmPinRefs.current[index + 1]?.focus()
  }

  const handleConfirmPinKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !confirmPin[index] && index > 0) confirmPinRefs.current[index - 1]?.focus()
  }

  const handleSetPin = async () => {
    const np = newPin.join('')
    const cp = confirmPin.join('')
    if (np.length < 5) { setSetPinError('Please enter a 5-digit PIN'); return }
    if (np !== cp) { setSetPinError('PINs do not match'); return }
    if (!client) return
    setSetPinLoading(true)
    setSetPinError('')
    try {
      const { error: updateErr } = await supabase
        .from('clients')
        .update({ pin: np, pin_changed: true })
        .eq('id', client.id)
      if (updateErr) throw updateErr

      supabase.auth.getSession().then(({ data }) => {
        fetch('https://eoxgaawoyftjnjkmjbmk.supabase.co/functions/v1/create-client-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${data.session?.access_token}`
          },
          body: JSON.stringify({ clientId: client.id, phone: client.phone, pin: np })
        }).catch(err => console.error('create-client-user failed:', err))
      })

      setCurrentScreen('home')
    } catch (err: unknown) {
      setSetPinError(err instanceof Error ? err.message : 'Failed to set PIN')
    } finally {
      setSetPinLoading(false)
    }
  }

  const doSignOut = () => {
    setClient(null)
    setPin(['', '', '', '', ''])
    setPhone('')
    setServices([])
    setStaff([])
    setSelectedService(null)
    setSelectedDate('')
    setSelectedTime('')
    setSelectedStaff(null)
    setBookingRef('')
    setMenuOpen(false)
    setNewPin(['', '', '', '', ''])
    setConfirmPin(['', '', '', '', ''])
    setSetPinError('')
    setCurrentScreen('login')
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setShowOtpMessage(false)

    const enteredPin = pin.join('')
    if (enteredPin.length < 5) { setError('Please enter your 5-digit PIN'); return }

    const fullPhone = `${countryCode}${phone.replace(/^0+/, '')}`
    setLoading(true)
    try {
      let { data: clientData, error: fetchError } = await supabase
        .from('clients')
        .select('id, name, phone, pin_changed')
        .eq('salon_id', salon!.id)
        .eq('phone', fullPhone)
        .maybeSingle()

      if (fetchError) throw fetchError

      if (!clientData) {
        const { data: clientData2, error: fetchError2 } = await supabase
          .from('clients')
          .select('id, name, phone, pin_changed')
          .eq('salon_id', salon!.id)
          .eq('phone', '+' + fullPhone)
          .maybeSingle()
        if (fetchError2) throw fetchError2
        clientData = clientData2
      }

      if (!clientData) { setError('Phone number not registered. Please ask the salon to add you.'); return }

      const email = `${(clientData.phone as string).replace(/\s+/g, '')}@noorie-client.internal`
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: enteredPin })
      if (signInError) { setError('Incorrect PIN'); return }

      setClient({ id: clientData.id as string, name: clientData.name as string, phone: clientData.phone as string })

      const { data: svcData } = await supabase
        .from('services')
        .select('id, name, category, duration_minutes, price, is_active')
        .eq('salon_id', salon!.id)
        .eq('is_active', true)
        .order('category')
      setServices((svcData as Service[]) ?? [])

      const { data: staffData } = await supabase
        .from('staff')
        .select('id, name, role')
        .eq('salon_id', salon!.id)
        .eq('is_active', true)
        .neq('role', 'owner')
      setStaff((staffData as StaffMember[]) ?? [])

      setSelectedDate(getTomorrow())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pinChanged = (clientData as any).pin_changed
      setCurrentScreen(pinChanged ? 'home' : 'set-pin')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleBook = async () => {
    if (!selectedService || !salon || !client) return
    setBookingLoading(true)
    setBookingError('')
    try {
      const date = selectedDate || getTomorrow()
      const time = selectedTime || '09:00'
      const starts_at = `${date}T${time}:00+04:00`

      const [h, m] = time.split(':').map(Number)
      const totalMins = h * 60 + m + selectedService.duration_minutes
      const endH = Math.floor(totalMins / 60)
      const endM = totalMins % 60
      const ends_at = `${date}T${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00+04:00`

      const { data: apptData, error: apptErr } = await supabase
        .from('appointments')
        .insert({
          salon_id: salon.id,
          client_id: client.id,
          staff_id: selectedStaff?.id ?? null,
          status: 'scheduled',
          starts_at,
          ends_at,
          notes: null,
          is_walk_in: false,
        })
        .select('id, reference_number')
        .single()

      if (apptErr || !apptData) throw apptErr ?? new Error('Booking failed')

      const { error: svcErr } = await supabase
        .from('appointment_services')
        .insert({
          appointment_id: apptData.id,
          service_id: selectedService.id,
          staff_id: selectedStaff?.id ?? null,
          price: 0,
          commission_pct: selectedService.commission_pct ?? 0,
          status: 'pending',
        })

      if (svcErr) throw svcErr

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const refNum = (apptData as any).reference_number
      setBookingRef(refNum ? `APT-${String(refNum).padStart(4, '0')}` : `APT-${apptData.id.slice(0, 8).toUpperCase()}`)
      setCurrentScreen('book-confirm')
    } catch (err: unknown) {
      setBookingError(err instanceof Error ? err.message : 'Booking failed. Please try again.')
    } finally {
      setBookingLoading(false)
    }
  }

  // ── Loading / not found ────────────────────────────────────────────────────

  if (salonLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' }}>
        <p style={{ color: '#6b7280', fontSize: 13 }}>Loading...</p>
      </div>
    )
  }

  if (salonNotFound) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' }}>
        <p style={{ color: '#991b1b', fontSize: 14, textAlign: 'center' }}>Salon not found.</p>
      </div>
    )
  }

  // ── Hamburger menu overlay ─────────────────────────────────────────────────

  const menuOverlay = menuOpen && (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#ffffff', zIndex: 100, display: 'flex', flexDirection: 'column', maxWidth: 480, margin: '0 auto' }}>
      <div style={headerStyle}>
        <p style={{ color: '#ffffff', fontSize: 15, fontWeight: 700, margin: 0 }}>{salon?.name}</p>
        <button
          onClick={() => setMenuOpen(false)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ffffff', fontSize: 20, lineHeight: 1, padding: 4 }}
        >
          ✕
        </button>
      </div>

      <div style={{ padding: '20px 16px', borderBottom: '0.5px solid #e0e0e0', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: '#034325', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ color: '#ffffff', fontSize: 16, fontWeight: 700 }}>{client ? initials(client.name) : '?'}</span>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111' }}>{client?.name}</p>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>{client?.phone}</p>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {[
          'My profile', 'Upcoming', 'History', 'Loyalty', 'Reviews', 'Contact salon', 'About Noorie',
        ].map(label => (
          <button
            key={label}
            onClick={() => alert('Coming soon')}
            style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: '0.5px solid #e0e0e0', padding: '0 16px', height: 44, fontSize: 13, color: '#111', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            {label}
          </button>
        ))}
        <div style={{ height: 1, backgroundColor: '#e0e0e0', margin: '8px 0' }} />
        <button
          onClick={doSignOut}
          style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: '0.5px solid #e0e0e0', padding: '0 16px', height: 44, fontSize: 13, color: '#111', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          Sign out
        </button>
        <button
          onClick={() => alert('Coming soon')}
          style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '0 16px', height: 44, fontSize: 13, color: '#991b1b', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          Delete account
        </button>
      </div>
    </div>
  )

  // ── Home screen ────────────────────────────────────────────────────────────

  if (currentScreen === 'home') {
    const offerServices = services.filter(s => s.price > 0).slice(0, 2)
    return (
      <div style={screenWrap}>
        {menuOverlay}
        <div style={headerStyle}>
          <div>
            <p style={{ color: '#ffffff', fontSize: 16, fontWeight: 700, margin: 0 }}>Hi {client?.name}</p>
            <p style={{ color: '#00BF00', fontSize: 12, margin: '2px 0 0' }}>{salon?.name}</p>
          </div>
          <button
            onClick={() => setMenuOpen(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', flexDirection: 'column', gap: 4 }}
          >
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: 20, height: 2, backgroundColor: '#ffffff', borderRadius: 1 }} />
            ))}
          </button>
        </div>

        <div style={{ flex: 1, padding: '16px 16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {offerServices.length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Special offers</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {offerServices.map(s => (
                  <div key={s.id} style={{ backgroundColor: '#ffffff', border: '0.5px solid #e0e0e0', borderRadius: 8, padding: 12 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#111', margin: '0 0 4px' }}>{s.name}</p>
                    <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>{s.duration_minutes} min · AED {s.price}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 'auto' }}>
            <button
              onClick={() => setCurrentScreen('book-service')}
              style={{ backgroundColor: '#034325', color: '#ffffff', border: 'none', borderRadius: 8, padding: 13, fontSize: 14, fontWeight: 600, cursor: 'pointer', width: '100%' }}
            >
              Book an appointment
            </button>
            <button
              onClick={() => alert('Coming soon')}
              style={{ backgroundColor: 'transparent', color: '#034325', border: '1px solid #034325', borderRadius: 8, padding: 13, fontSize: 14, fontWeight: 600, cursor: 'pointer', width: '100%' }}
            >
              My bookings
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Book service screen ────────────────────────────────────────────────────

  if (currentScreen === 'book-service') {
    const grouped = services.reduce<Record<string, Service[]>>((acc, s) => {
      const cat = s.category ?? 'Other'
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(s)
      return acc
    }, {})

    return (
      <div style={screenWrap}>
        <div style={headerStyle}>
          <button
            onClick={() => setCurrentScreen('home')}
            style={{ background: 'none', border: '1px solid rgba(255,255,255,0.5)', borderRadius: 6, color: '#ffffff', fontSize: 12, padding: '4px 12px', cursor: 'pointer' }}
          >
            Back
          </button>
          <p style={{ color: '#ffffff', fontSize: 15, fontWeight: 600, margin: 0 }}>Choose a service</p>
          <div style={{ width: 60 }} />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 100px' }}>
          {Object.entries(grouped).map(([cat, svcs]) => (
            <div key={cat}>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '12px 0 8px' }}>{cat}</p>
              {svcs.map(s => {
                const isSelected = selectedService?.id === s.id
                return (
                  <div
                    key={s.id}
                    onClick={() => setSelectedService(s)}
                    style={{
                      backgroundColor: '#ffffff',
                      border: isSelected ? '2px solid #034325' : '0.5px solid #e0e0e0',
                      borderLeft: isSelected ? '2px solid #034325' : '2px solid transparent',
                      borderRadius: 8, padding: '10px 12px', marginBottom: 8,
                      cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}
                  >
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#111', margin: '0 0 2px' }}>{s.name}</p>
                      <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>{s.duration_minutes} min{s.price > 0 ? ` · AED ${s.price}` : ''}</p>
                    </div>
                    {isSelected && <span style={{ color: '#034325', fontSize: 16, fontWeight: 700 }}>✓</span>}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        <div style={{ position: 'sticky', bottom: 0, padding: '12px 16px', backgroundColor: '#f9fafb', borderTop: '0.5px solid #e0e0e0' }}>
          <button
            onClick={() => setCurrentScreen('book-datetime')}
            disabled={!selectedService}
            style={{ backgroundColor: selectedService ? '#034325' : '#e0e0e0', color: selectedService ? '#ffffff' : '#9ca3af', border: 'none', borderRadius: 8, padding: 13, fontSize: 14, fontWeight: 600, cursor: selectedService ? 'pointer' : 'not-allowed', width: '100%' }}
          >
            Next
          </button>
        </div>
      </div>
    )
  }

  // ── Book date/time screen ──────────────────────────────────────────────────

  if (currentScreen === 'book-datetime') {
    const today = new Date().toISOString().split('T')[0]
    return (
      <div style={screenWrap}>
        <div style={headerStyle}>
          <button
            onClick={() => setCurrentScreen('book-service')}
            style={{ background: 'none', border: '1px solid rgba(255,255,255,0.5)', borderRadius: 6, color: '#ffffff', fontSize: 12, padding: '4px 12px', cursor: 'pointer' }}
          >
            Back
          </button>
          <p style={{ color: '#ffffff', fontSize: 15, fontWeight: 600, margin: 0 }}>Pick a time</p>
          <div style={{ width: 60 }} />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 100px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>Date</p>
            <input
              type="date"
              value={selectedDate}
              min={today}
              onChange={e => setSelectedDate(e.target.value)}
              style={{ width: '100%', border: '0.5px solid #1D558F', borderRadius: 8, padding: '10px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box', backgroundColor: '#ffffff' }}
            />
          </div>

          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Available slots</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {TIME_SLOTS.map(t => {
                const isSelected = selectedTime === t
                return (
                  <button
                    key={t}
                    onClick={() => setSelectedTime(t)}
                    style={{
                      border: '0.5px solid #034325', borderRadius: 6, padding: '4px 10px', fontSize: 12,
                      backgroundColor: isSelected ? '#034325' : '#ffffff',
                      color: isSelected ? '#ffffff' : '#034325',
                      cursor: 'pointer', fontWeight: isSelected ? 600 : 400,
                    }}
                  >
                    {t}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Technician (optional)</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                onClick={() => setSelectedStaff(null)}
                style={{ backgroundColor: '#ffffff', border: selectedStaff === null ? '2px solid #034325' : '0.5px solid #e0e0e0', borderRadius: 8, padding: '10px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#111', margin: '0 0 2px' }}>Any available</p>
                  <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>We'll assign the best match</p>
                </div>
                {selectedStaff === null && <span style={{ color: '#034325', fontSize: 16, fontWeight: 700 }}>✓</span>}
              </div>
              {staff.map(m => {
                const isSelected = selectedStaff?.id === m.id
                return (
                  <div
                    key={m.id}
                    onClick={() => setSelectedStaff(m)}
                    style={{ backgroundColor: '#ffffff', border: isSelected ? '2px solid #034325' : '0.5px solid #e0e0e0', borderRadius: 8, padding: '10px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#111', margin: '0 0 2px' }}>{m.name}</p>
                      <p style={{ fontSize: 12, color: '#6b7280', margin: 0, textTransform: 'capitalize' }}>{m.role}</p>
                    </div>
                    {isSelected && <span style={{ color: '#034325', fontSize: 16, fontWeight: 700 }}>✓</span>}
                  </div>
                )
              })}
            </div>
          </div>

          {bookingError && <p style={{ fontSize: 13, color: '#991b1b', margin: 0 }}>{bookingError}</p>}
        </div>

        <div style={{ position: 'sticky', bottom: 0, padding: '12px 16px', backgroundColor: '#f9fafb', borderTop: '0.5px solid #e0e0e0' }}>
          <button
            onClick={handleBook}
            disabled={bookingLoading || !selectedTime}
            style={{ backgroundColor: selectedTime ? '#034325' : '#e0e0e0', color: selectedTime ? '#ffffff' : '#9ca3af', border: 'none', borderRadius: 8, padding: 13, fontSize: 14, fontWeight: 600, cursor: selectedTime ? 'pointer' : 'not-allowed', width: '100%' }}
          >
            {bookingLoading ? 'Booking...' : 'Confirm booking'}
          </button>
        </div>
      </div>
    )
  }

  // ── Book confirm screen ────────────────────────────────────────────────────

  if (currentScreen === 'book-confirm') {
    const displayDate = selectedDate ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'long' }) : ''
    return (
      <div style={{ ...screenWrap, justifyContent: 'center', padding: '32px 24px', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 28, color: '#034325' }}>✓</span>
          </div>
          <p style={{ fontSize: 18, fontWeight: 700, color: '#034325', margin: 0 }}>You are booked in</p>
          <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>{salon?.name}</p>
        </div>

        <div style={{ backgroundColor: '#ffffff', border: '0.5px solid #e0e0e0', borderRadius: 10, padding: '16px 18px', width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Booking ref</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#034325' }}>{bookingRef}</span>
          </div>
          <div style={{ height: 0.5, backgroundColor: '#f0f0f0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Date & time</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#111' }}>{displayDate} · {selectedTime}</span>
          </div>
          <div style={{ height: 0.5, backgroundColor: '#f0f0f0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Service</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#111' }}>{selectedService?.name}</span>
          </div>
          {selectedStaff && (
            <>
              <div style={{ height: 0.5, backgroundColor: '#f0f0f0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: '#6b7280' }}>Technician</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: '#111' }}>{selectedStaff.name}</span>
              </div>
            </>
          )}
        </div>

        <button
          onClick={() => setCurrentScreen('home')}
          style={{ backgroundColor: 'transparent', color: '#034325', border: '1px solid #034325', borderRadius: 8, padding: '12px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer', width: '100%' }}
        >
          Back to home
        </button>
      </div>
    )
  }

  // ── Set PIN screen ─────────────────────────────────────────────────────────

  if (currentScreen === 'set-pin') {
    const pinBoxStyle: React.CSSProperties = {
      width: 48, height: 52, textAlign: 'center', fontSize: 20, fontWeight: 700,
      border: '1px solid #1D558F', borderRadius: 8, outline: 'none',
      backgroundColor: '#ffffff', color: '#034325', boxSizing: 'border-box',
    }
    return (
      <div style={{ ...screenWrap, backgroundColor: '#ffffff' }}>
        <div style={headerStyle}>
          <p style={{ color: '#ffffff', fontSize: 15, fontWeight: 700, margin: 0 }}>{salon?.name}</p>
          <div style={{ width: 60 }} />
        </div>

        <div style={{ flex: 1, padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 17, fontWeight: 700, color: '#034325', margin: '0 0 6px' }}>Set your own PIN</p>
            <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Choose a 5-digit PIN you will use to sign in</p>
          </div>

          <div>
            <p style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, margin: '0 0 10px', textAlign: 'center' }}>New PIN</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              {newPin.map((digit, i) => (
                <input
                  key={i}
                  ref={el => { newPinRefs.current[i] = el }}
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => handleNewPinChange(i, e.target.value)}
                  onKeyDown={e => handleNewPinKeyDown(i, e)}
                  style={pinBoxStyle}
                />
              ))}
            </div>
          </div>

          <div>
            <p style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, margin: '0 0 10px', textAlign: 'center' }}>Confirm PIN</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              {confirmPin.map((digit, i) => (
                <input
                  key={i}
                  ref={el => { confirmPinRefs.current[i] = el }}
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => handleConfirmPinChange(i, e.target.value)}
                  onKeyDown={e => handleConfirmPinKeyDown(i, e)}
                  style={pinBoxStyle}
                />
              ))}
            </div>
          </div>

          {setPinError && <p style={{ fontSize: 13, color: '#991b1b', margin: 0, textAlign: 'center' }}>{setPinError}</p>}

          <button
            onClick={handleSetPin}
            disabled={setPinLoading}
            style={{ backgroundColor: '#034325', color: '#ffffff', border: 'none', borderRadius: 8, padding: 13, fontSize: 15, fontWeight: 700, cursor: setPinLoading ? 'not-allowed' : 'pointer', opacity: setPinLoading ? 0.7 : 1, width: '100%' }}
          >
            {setPinLoading ? 'Saving...' : 'Set PIN & continue'}
          </button>
        </div>
      </div>
    )
  }

  // ── Login screen ───────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 48, paddingLeft: 16, paddingRight: 16 }}>

      <div style={{ backgroundColor: '#034325', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400, textAlign: 'center', marginBottom: 24, boxSizing: 'border-box' }}>
        <p style={{ color: '#ffffff', fontSize: 20, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>{salon?.name}</p>
        {(salon?.city || salon?.country) && (
          <p style={{ color: '#C9A227', fontSize: 13, margin: '8px 0 0', lineHeight: 1.3 }}>
            {[salon.city, salon.country].filter(Boolean).join(', ')}
          </p>
        )}
      </div>

      <div style={{ width: '100%', maxWidth: 400, paddingBottom: 40, boxSizing: 'border-box' }}>
        <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          <div>
            <p style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, margin: '0 0 6px' }}>Mobile number</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                value={countryCode}
                onChange={e => setCountryCode(e.target.value)}
                style={{ border: '1px solid #1D558F', borderRadius: 8, outline: 'none', backgroundColor: '#f9f9f9', fontSize: 13, padding: '0 8px', height: 44, cursor: 'pointer', flexShrink: 0 }}
              >
                {CLIENT_COUNTRY_CODES.map(c => (
                  <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
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
                  ref={el => { pinRefs.current[i] = el }}
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => handlePinChange(i, e.target.value)}
                  onKeyDown={e => handlePinKeyDown(i, e)}
                  style={{ width: 48, height: 52, textAlign: 'center', fontSize: 20, fontWeight: 700, border: '1px solid #1D558F', borderRadius: 8, outline: 'none', backgroundColor: '#ffffff', color: '#034325', boxSizing: 'border-box' }}
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

          <div style={{ textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => setShowOtpMessage(p => !p)}
              style={{ background: 'none', border: 'none', color: '#034325', fontSize: 13, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
            >
              First time? Request OTP
            </button>
            {showOtpMessage && (
              <p style={{ fontSize: 12, color: '#6b7280', margin: '8px 0 0' }}>Please ask your salon to send you an OTP</p>
            )}
          </div>

        </form>
      </div>
    </div>
  )
}
