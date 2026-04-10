import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function SetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      const { error: err } = await supabase.auth.updateUser({ password })
      if (err) throw err
      navigate('/dashboard')
    } catch (err: any) {
      setError(err?.message || 'Failed to set password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#000000' }}>

      {/* Header */}
      <div style={{ backgroundColor: '#034325', padding: '20px 24px' }}>
        <p style={{ color: '#ffffff', fontSize: 20, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>
          Noorie
        </p>
        <p style={{ color: '#00BF00', fontSize: 11, margin: '4px 0 0', lineHeight: 1.3 }}>
          Noorie knows your salon.
        </p>
      </div>

      {/* Title */}
      <div className="text-center py-6">
        <p style={{ color: '#ffffff', fontSize: 16, fontWeight: 600, margin: 0 }}>
          Set your password
        </p>
        <p style={{ color: '#00BF00', fontSize: 13, margin: '4px 0 0' }}>
          First time setup
        </p>
      </div>

      {/* Form */}
      <div className="flex-1 flex flex-col items-center px-6 pb-10">
        <form onSubmit={handleSubmit} className="w-full max-w-sm flex flex-col gap-4">

          <input
            type="password"
            placeholder="New password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={{
              backgroundColor: '#133257', color: '#ffffff',
              border: '1px solid #1D558F', borderRadius: 8,
              padding: '11px 14px', fontSize: 14, outline: 'none', width: '100%',
              boxSizing: 'border-box',
            }}
          />

          <input
            type="password"
            placeholder="Confirm password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            required
            style={{
              backgroundColor: '#133257', color: '#ffffff',
              border: '1px solid #1D558F', borderRadius: 8,
              padding: '11px 14px', fontSize: 14, outline: 'none', width: '100%',
              boxSizing: 'border-box',
            }}
          />

          {error && (
            <p style={{ color: '#ff4444', fontSize: 13, margin: 0 }}>{error}</p>
          )}

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
            {loading ? 'Saving…' : 'Set password'}
          </button>
        </form>
      </div>

      {/* Footer */}
      <div className="text-center pb-6">
        <p style={{ color: '#1D558F', fontSize: 10, margin: 0 }}>
          Powered by Blue Flute Consulting LLC-FZ
        </p>
      </div>
    </div>
  )
}
