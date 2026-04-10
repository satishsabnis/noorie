import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { signInWithMobile, getStaffRecord } from '../lib/auth'
import { useAuthStore } from '../stores/authStore'

const COUNTRY_CODES = ['+971', '+91', '+1', '+44']

export default function Login() {
  const navigate = useNavigate()
  const { signIn } = useAuthStore()

  const [countryCode, setCountryCode] = useState('+971')
  const [mobile, setMobile] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { user } = await signInWithMobile(countryCode, mobile, password)
      if (!user) throw new Error('Sign in failed')

      const staff = await getStaffRecord(countryCode, mobile)
      if (!staff) throw new Error('Staff record not found')

      if (!staff.role) {
        navigate('/set-password')
        return
      }

      signIn(user, staff)
      navigate('/dashboard')
    } catch (err: any) {
      const msg = err?.message ?? ''
      if (msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('credentials')) {
        setError('Invalid mobile number or password.')
      } else if (msg.includes('Staff record not found')) {
        setError('No staff account found for this number.')
      } else {
        setError(msg || 'Sign in failed. Please try again.')
      }
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
          New Look Beauty Salon
        </p>
        <p style={{ color: '#00BF00', fontSize: 11, margin: 0, lineHeight: 1.3 }}>
          Noorie knows your salon.
        </p>
      </div>

      {/* Form */}
      <div className="flex-1 flex flex-col items-center w-full px-4 pb-10">
        <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 400 }} className="flex flex-col gap-4">

          {/* Mobile input with country code */}
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
              autoComplete="off"
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
              placeholder="Password"
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

          {error && (
            <p style={{ color: '#ff4444', fontSize: 13, margin: 0 }}>{error}</p>
          )}

          {/* Sign in button */}
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
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
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
