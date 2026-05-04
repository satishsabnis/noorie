import { useState } from 'react'
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
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

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
          body: JSON.stringify({ authEmail, password, salonName, ownerName, countryCode, mobile, email }),
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
        <p style={{ color: '#ffffff', fontSize: 15, fontWeight: 500, margin: '10px 0 4px', lineHeight: 1.3 }}>
          Register Your Salon
        </p>
        <p style={{ color: '#00BF00', fontSize: 11, margin: 0, lineHeight: 1.3 }}>
          Noorie knows your salon.
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
            onChange={e => setSalonName(e.target.value)}
            required
            style={{
              backgroundColor: '#ffffff', color: '#000000',
              border: '1px solid #1D558F', borderRadius: 8,
              padding: '11px 14px', fontSize: 14, outline: 'none', width: '100%',
              boxSizing: 'border-box',
            }}
          />

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