import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'

const COUNTRY_CODES = ['+971', '+91', '+1', '+44']

export default function Signup() {
  const navigate = useNavigate()

  const [countryCode, setCountryCode] = useState('+971')
  const [mobile, setMobile] = useState('')
  const [email, setEmail] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [salonName, setSalonName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [slug, setSlug] = useState('')
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
  const slugTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const checkSlug = (value: string) => {
    if (!value) { setSlugStatus('idle'); return }
    setSlugStatus('checking')
    if (slugTimerRef.current) clearTimeout(slugTimerRef.current)
    slugTimerRef.current = setTimeout(async () => {
      const res = await fetch(
        `https://eoxgaawoyftjnjkmjbmk.supabase.co/functions/v1/register-salon?slug=${value}`
      )
      const data = await res.json()
      setSlugStatus(data.available ? 'available' : 'taken')
    }, 500)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!slug.trim()) {
      setError('Please enter a booking URL')
      return
    }
    if (slugStatus === 'taken') {
      setError('This booking URL is already taken. Please choose another.')
      return
    }
    if (slugStatus === 'checking') {
      setError('Please wait while we check your URL availability')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    try {
      const authEmail = `${(countryCode + mobile).replace(/\D/g, '')}@noorie.internal`

      const res = await fetch(
        'https://eoxgaawoyftjnjkmjbmk.supabase.co/functions/v1/register-salon',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ authEmail, password, salonName, ownerName, countryCode, mobile, email, slug }),
        }
      )
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Registration failed.')

      navigate('/login', { state: { registered: true } })
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center bg-white pt-12 px-4">

      {/* Header card */}
      <div style={{
        backgroundColor: '#045c32', borderRadius: 16,
        padding: '24px', width: '100%', maxWidth: 400,
        textAlign: 'center', marginBottom: 8,
      }}>
        <p style={{ color: '#ffffff', fontSize: 20, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>
          Noorie
        </p>
        <p style={{ color: '#00BF00', fontSize: 13, margin: '12px 0 0', lineHeight: 1.3 }}>
          AI Powered Salon Manager
        </p>
      </div>

      {/* Form */}
      <div className="flex-1 flex flex-col items-center w-full px-4 pb-10">
        <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 400 }} className="flex flex-col gap-4">

          {/* Salon name */}
          <input
            type="text"
            placeholder="Salon name"
            value={salonName}
            onChange={e => {
              setSalonName(e.target.value)
              const auto = e.target.value
                .toLowerCase()
                .trim()
                .replace(/[^a-z0-9\s-]/g, '')
                .replace(/\s+/g, '-')
                .replace(/-+/g, '-')
              setSlug(auto)
              checkSlug(auto)
            }}
            required
            style={{
              backgroundColor: '#ffffff', color: '#000000',
              border: '1px solid #1D558F', borderRadius: 8,
              padding: '11px 14px', fontSize: 14, outline: 'none', width: '100%',
              boxSizing: 'border-box',
            }}
          />

          {/* Booking URL / slug */}
          <div>
            <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, marginBottom: 4, display: 'block' }}>
              Your booking URL <span style={{ color: '#991b1b' }}>*</span>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', border: `0.5px solid ${slugStatus === 'taken' ? '#991b1b' : '#1D558F'}`, borderRadius: 6, overflow: 'hidden' }}>
              <span style={{ padding: '0 10px', fontSize: 12, color: '#6b7280', backgroundColor: '#f9f9f9', borderRight: '0.5px solid #1D558F', whiteSpace: 'nowrap', lineHeight: '36px' }}>
                noorie-salon.vercel.app/
              </span>
              <input
                value={slug}
                onChange={e => {
                  const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')
                  setSlug(val)
                  checkSlug(val)
                }}
                style={{ flex: 1, border: 'none', outline: 'none', padding: '0 10px', fontSize: 13, height: 36, backgroundColor: '#ffffff' }}
                placeholder="your-salon-name"
                required
              />
            </div>
            {slugStatus === 'checking'   && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>Checking availability...</div>}
            {slugStatus === 'available'  && <div style={{ fontSize: 11, color: '#15803d', marginTop: 4 }}>Available</div>}
            {slugStatus === 'taken'      && <div style={{ fontSize: 11, color: '#991b1b', marginTop: 4 }}>This URL is already taken. Please choose another.</div>}
            {slugStatus === 'idle'       && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>This is the link your clients will use to book appointments</div>}
          </div>

          {/* Owner full name */}
          <input
            type="text"
            placeholder="Your full name"
            value={ownerName}
            onChange={e => setOwnerName(e.target.value)}
            required
            style={{
              backgroundColor: '#ffffff', color: '#000000',
              border: '1px solid #1D558F', borderRadius: 8,
              padding: '11px 14px', fontSize: 14, outline: 'none', width: '100%',
              boxSizing: 'border-box',
            }}
          />

          {/* Email */}
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={{
              backgroundColor: '#ffffff', color: '#000000',
              border: '1px solid #1D558F', borderRadius: 8,
              padding: '11px 14px', fontSize: 14, outline: 'none', width: '100%',
              boxSizing: 'border-box',
            }}
          />

          {/* Mobile with country code */}
          <div className="flex gap-2">
            <select
              value={countryCode}
              onChange={e => setCountryCode(e.target.value)}
              style={{
                backgroundColor: '#ffffff', color: '#000000',
                border: '1px solid #1D558F', borderRadius: 8,
                padding: '11px 10px', fontSize: 14, outline: 'none',
                flexShrink: 0, width: 80,
              }}
            >
              {COUNTRY_CODES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input
              type="tel"
              placeholder="Mobile number"
              value={mobile}
              onChange={e => setMobile(e.target.value)}
              required
              style={{
                flex: 1, backgroundColor: '#ffffff', color: '#000000',
                border: '1px solid #1D558F', borderRadius: 8,
                padding: '11px 14px', fontSize: 14, outline: 'none',
              }}
            />
          </div>

          {/* Password */}
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password (min 8 characters)"
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{
                backgroundColor: '#ffffff', color: '#000000',
                border: '1px solid #1D558F', borderRadius: 8,
                padding: '11px 44px 11px 14px', fontSize: 14, outline: 'none', width: '100%',
                boxSizing: 'border-box',
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(p => !p)}
              style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                color: '#6b7280', display: 'flex', alignItems: 'center',
              }}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {/* Confirm password */}
          <div style={{ position: 'relative' }}>
            <input
              type={showConfirm ? 'text' : 'password'}
              placeholder="Confirm password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              style={{
                backgroundColor: '#ffffff', color: '#000000',
                border: '1px solid #1D558F', borderRadius: 8,
                padding: '11px 44px 11px 14px', fontSize: 14, outline: 'none', width: '100%',
                boxSizing: 'border-box',
              }}
            />
            <button
              type="button"
              onClick={() => setShowConfirm(p => !p)}
              style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                color: '#6b7280', display: 'flex', alignItems: 'center',
              }}
              tabIndex={-1}
            >
              {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {error && (
            <p style={{ color: '#991b1b', fontSize: 13, margin: 0 }}>{error}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              backgroundColor: '#034325', color: '#ffffff',
              border: 'none', borderRadius: 8,
              padding: '13px', fontSize: 15, fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1, width: '100%',
            }}
          >
            {loading ? 'Creating your salon...' : 'Create My Salon'}
          </button>

          {/* Back to login */}
          <div style={{ textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => navigate('/login')}
              style={{
                background: 'none', border: '1px solid #034325', borderRadius: 8,
                padding: '10px 24px', fontSize: 13, fontWeight: 600,
                color: '#034325', cursor: 'pointer',
              }}
            >
              Back
            </button>
          </div>

        </form>
      </div>

      {/* Footer */}
      <div className="text-center pb-6">
        <p style={{ color: '#6b7280', fontSize: 10, margin: 0 }}>
          Powered by Blue Flute Consulting LLC-FZ
        </p>
      </div>
    </div>
  )
}