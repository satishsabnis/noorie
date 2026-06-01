import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { SCREEN_HELP, NOORIE_SYSTEM_PROMPT } from '../lib/helpContent'

function getScreenLabel(path: string): string {
  if (path === '/dashboard') return 'Dashboard'
  if (path === '/appointments/new') return 'New appointment'
  if (path.startsWith('/appointments/')) return 'Appointment detail'
  if (path === '/clients') return 'Clients'
  if (path.startsWith('/clients/')) return 'Client profile'
  if (path === '/staff/new') return 'Add staff'
  if (path.startsWith('/staff/')) return 'Edit staff'
  if (path === '/reports') return 'Reports'
  if (path === '/admin') return 'Admin'
  return 'Noorie'
}

export default function HelpPanel({ onClose }: { onClose: () => void }) {
  const location = useLocation()
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768)

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const screenHelp = SCREEN_HELP[location.pathname] ?? SCREEN_HELP['default']
  const screenLabel = getScreenLabel(location.pathname)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F1') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  async function handleSend() {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setLoading(true)
    const newMessages = [...messages, { role: 'user' as const, content: userMsg }]
    setMessages(newMessages)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/noorie-bot`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          system: NOORIE_SYSTEM_PROMPT + '\n\nCurrent screen: ' + screenLabel,
          tools: [],
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          salonId: 'help',
        }),
      })
      const result = await res.json()
      const reply = result.content?.[0]?.text ?? 'Sorry, I could not get an answer. Please try again.'
      setMessages([...newMessages, { role: 'assistant', content: reply }])
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: 'Connection error. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  const avatar = (
    <div style={{ width: 24, height: 24, borderRadius: '50%', backgroundColor: '#034325', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ color: '#00BF00', fontSize: 12, fontWeight: 700 }}>N</span>
    </div>
  )

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', top: 52, left: 0, right: isMobile ? 0 : 360, bottom: 0,
          background: 'rgba(0,0,0,0.2)', zIndex: 99,
        }}
      />
      <div style={{
        position: 'fixed', top: 52, right: 0, bottom: 0, width: isMobile ? '100%' : 360,
        zIndex: 100, background: '#ffffff', borderLeft: '0.5px solid #e5e7eb',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ background: '#034325', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00BF00', flexShrink: 0 }} />
            <span style={{ color: '#00BF00', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>Noorie Help</span>
          </div>
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'none', color: 'rgba(255,255,255,0.7)', fontSize: 12, cursor: 'pointer' }}
          >Close</button>
        </div>

        {/* Screen label row */}
        <div style={{ padding: '10px 14px', borderBottom: '0.5px solid #f0f0f0' }}>
          <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' }}>You are on</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#034325' }}>{screenLabel}</div>
        </div>

        {/* Static about card */}
        <div style={{ padding: '12px 14px', flexShrink: 0 }}>
          <div style={{ background: '#f0fdf4', border: '0.5px solid #bbf7d0', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: '#166534', fontWeight: 500, marginBottom: 6 }}>About this screen</div>
            <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.6 }}>{screenHelp}</div>
          </div>
        </div>

        {/* Conversation area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.map((m, i) => (
            m.role === 'user' ? (
              <div key={i} style={{ alignSelf: 'flex-end', background: '#034325', color: '#fff', borderRadius: 8, padding: '8px 12px', fontSize: 13, maxWidth: '80%' }}>
                {m.content}
              </div>
            ) : (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, maxWidth: '85%' }}>
                {avatar}
                <div style={{ background: '#f0fdf4', border: '0.5px solid #bbf7d0', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#374151', lineHeight: 1.6 }}>
                  {m.content}
                </div>
              </div>
            )
          ))}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {avatar}
              <span style={{ fontSize: 12, color: '#9ca3af' }}>Noorie is thinking...</span>
            </div>
          )}
        </div>

        {/* Input row */}
        <div style={{ padding: '12px 14px', borderTop: '0.5px solid #e5e7eb', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              rows={1}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              disabled={loading}
              placeholder="Ask Noorie a question..."
              style={{ resize: 'none', flex: 1, border: '0.5px solid #d1d5db', borderRadius: 6, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              style={{ background: '#034325', color: '#fff', border: 'none', borderRadius: 6, width: 32, height: 32, fontSize: 14, cursor: loading || !input.trim() ? 'not-allowed' : 'pointer', flexShrink: 0 }}
            >▶</button>
          </div>
          <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 6 }}>Press F1 to close help</div>
        </div>
      </div>
    </>
  )
}
