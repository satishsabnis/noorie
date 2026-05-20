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

type Screen = 'login' | 'home'

export default function ClientApp() {
  const { slug } = useParams<{ slug: string }>()

  const [salon, setSalon] = useState<Salon | null>(null)
  const [salonLoading, setSalonLoading] = useState(true)
  const [salonNotFound, setSalonNotFound] = useState(false)

  const [countryCode, setCountryCode] = useState('+971')
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState(['', '', '', '', ''])
  const pinRefs = useRef<(HTMLInputElement | null)[]>([])

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showOtpMessage, setShowOtpMessage] = useState(false)

  const [currentScreen, setCurrentScreen] = useState<Screen>('login')
  const [client, setClient] = useState<Client | null>(null)

  useEffect(() => {
    if (!slug) return
    supabase
      .from('salons')
      .select('id, name, city, country')
      .eq('slug', slug)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setSalon(data as Salon)
        else setSalonNotFound(true)
        setSalonLoading(false)
      })
  }, [slug])

  const handlePinChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return
    const newPin = [...pin]
    newPin[index] = value
    setPin(newPin)
    if (value && index < 4) {
      pinRefs.current[index + 1]?.focus()
    }
  }

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      pinRefs.current[index - 1]?.focus()
    }
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setShowOtpMessage(false)

    const enteredPin = pin.join('')
    if (enteredPin.length < 5) {
      setError('Please enter your 5-digit PIN')
      return
    }

    const fullPhone = `${countryCode}${phone.replace(/^0+/, '')}`

    setLoading(true)
    try {
      const { data, error: fetchError } = await supabase
        .from('clients')
        .select('id, name, phone, pin')
        .eq('salon_id', salon!.id)
        .eq('phone', fullPhone)
        .maybeSingle()

      if (fetchError) throw fetchError

      if (!data) {
        setError('Phone number not registered. Please ask the salon to add you.')
        return
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const storedPin = (data as any).pin
      if (storedPin === null || storedPin === undefined || storedPin !== enteredPin) {
        setError('Incorrect PIN')
        return
      }

      setClient({ id: data.id as string, name: data.name as string, phone: data.phone as string })
      setCurrentScreen('home')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

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

  if (currentScreen === 'home') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
        <p style={{ fontSize: 20, fontWeight: 700, color: '#034325', margin: '0 0 8px' }}>Welcome, {client?.name}</p>
        <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 32px' }}>{salon?.name}</p>
        <button
          onClick={() => {
            setClient(null)
            setPin(['', '', '', '', ''])
            setPhone('')
            setCurrentScreen('login')
          }}
          style={{ background: 'none', border: '1px solid #034325', borderRadius: 8, padding: '10px 24px', fontSize: 13, color: '#034325', cursor: 'pointer' }}
        >
          Sign out
        </button>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 48, paddingLeft: 16, paddingRight: 16 }}>

      {/* Header */}
      <div style={{ backgroundColor: '#034325', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400, textAlign: 'center', marginBottom: 24, boxSizing: 'border-box' }}>
        <p style={{ color: '#ffffff', fontSize: 20, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>{salon?.name}</p>
        {(salon?.city || salon?.country) && (
          <p style={{ color: '#C9A227', fontSize: 13, margin: '8px 0 0', lineHeight: 1.3 }}>
            {[salon.city, salon.country].filter(Boolean).join(', ')}
          </p>
        )}
      </div>

      {/* Form */}
      <div style={{ width: '100%', maxWidth: 400, paddingBottom: 40, boxSizing: 'border-box' }}>
        <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Phone */}
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

          {/* PIN */}
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
                  style={{
                    width: 48, height: 52, textAlign: 'center', fontSize: 20, fontWeight: 700,
                    border: '1px solid #1D558F', borderRadius: 8, outline: 'none',
                    backgroundColor: '#ffffff', color: '#034325', boxSizing: 'border-box',
                  }}
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
