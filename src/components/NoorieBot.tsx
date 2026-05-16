import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '../stores/authStore'
import newlookLogo from '../assets/newlook-logo.jpg'

interface Message {
  role: 'noorie' | 'user'
  text: string
}

export default function NoorieBot() {
  const staffRecord = useAuthStore(s => s.staffRecord)
  const salonName = useAuthStore(s => s.salonName)
  const ownerName = staffRecord?.name ?? 'there'

  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [isListening, setIsListening] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    setMessages([{
      role: 'noorie',
      text: `Hi ${ownerName}! I am Noorie. What can I help you with today?`,
    }])
  }, [ownerName])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function handleSend() {
    const trimmed = input.trim()
    if (!trimmed || loading) return

    const userMsg: Message = { role: 'user', text: trimmed }
    const next: Message[] = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setLoading(true)

    try {
      const today = new Date().toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
      const system = `You are Noorie, an AI assistant for ${salonName ?? 'your'} salon. You help the salon owner with questions about their business. Be concise, friendly, and helpful. Answer in 2-3 sentences maximum unless more detail is needed. Today's date is ${today}.`

      const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined
      if (!apiKey) throw new Error('VITE_ANTHROPIC_API_KEY missing')

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system,
          messages: next.map(m => ({
            role: m.role === 'noorie' ? 'assistant' : 'user',
            content: m.text,
          })),
        }),
      })

      if (!res.ok) throw new Error(`API error ${res.status}`)
      const data = await res.json()
      const blocks = (data.content as { type: string; text?: string }[] | undefined) ?? []
      const textBlock = blocks.find(b => b.type === 'text')
      const responseText = textBlock?.text ?? '(no response)'
      setMessages(m => [...m, { role: 'noorie', text: responseText }])
    } catch (err) {
      console.error('[NoorieBot] handleSend error:', err)
      setMessages(m => [...m, { role: 'noorie', text: 'Sorry, I could not connect. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  function handleMic() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const W = window as any
    const SR = W.SpeechRecognition || W.webkitSpeechRecognition
    if (!SR) {
      alert('Voice input is not supported in this browser')
      return
    }
    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }
    const rec = new SR()
    rec.continuous = false
    rec.interimResults = false
    rec.lang = 'en-US'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const transcript = e.results?.[0]?.[0]?.transcript ?? ''
      setInput(transcript)
      setIsListening(false)
      try { rec.stop() } catch { /* noop */ }
    }
    rec.onerror = () => setIsListening(false)
    rec.onend = () => setIsListening(false)
    rec.start()
    recognitionRef.current = rec
    setIsListening(true)
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        aria-label="Open Noorie chat"
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 400,
          width: 56, height: 56, borderRadius: '50%',
          border: '2px solid #C9A227',
          padding: 0, cursor: 'pointer',
          backgroundColor: 'transparent',
          boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
          overflow: 'hidden',
        }}
      >
        <img
          src={newlookLogo}
          alt="Noorie"
          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
        />
      </button>
    )
  }

  const sendDisabled = loading || input.trim() === ''

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 400,
      width: 380, height: 520, borderRadius: 16, overflow: 'hidden',
      boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      display: 'flex', flexDirection: 'column',
      backgroundColor: '#ffffff',
    }}>
      {/* Header */}
      <div style={{
        backgroundColor: '#034325', height: 60, padding: '0 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img
            src={newlookLogo}
            alt=""
            style={{
              width: 32, height: 32, borderRadius: '50%',
              border: '1.5px solid #C9A227', objectFit: 'cover',
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ color: '#ffffff', fontSize: 14, fontWeight: 500, lineHeight: 1.2 }}>Noorie</span>
            <span style={{ color: '#00BF00', fontSize: 11, lineHeight: 1.2 }}>AI Salon Assistant</span>
          </div>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          aria-label="Close chat"
          style={{
            background: 'none', border: 'none',
            color: 'rgba(255,255,255,0.7)', fontSize: 22,
            cursor: 'pointer', padding: 0, lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {/* Chat area */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: 16,
        display: 'flex', flexDirection: 'column', gap: 12,
        backgroundColor: '#ffffff',
      }}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              maxWidth: '80%',
              padding: '10px 14px',
              fontSize: 13,
              ...(m.role === 'noorie'
                ? {
                    backgroundColor: '#f5f5f5',
                    color: '#1a1a1a',
                    borderRadius: '0 12px 12px 12px',
                    alignSelf: 'flex-start',
                  }
                : {
                    backgroundColor: '#034325',
                    color: '#ffffff',
                    borderRadius: '12px 0 12px 12px',
                    alignSelf: 'flex-end',
                    marginLeft: 'auto',
                  }),
            }}
          >
            {m.text}
          </div>
        ))}
        {loading && (
          <div style={{
            backgroundColor: '#f5f5f5', color: '#6b7280',
            borderRadius: '0 12px 12px 12px', padding: '10px 14px',
            fontSize: 13, maxWidth: '80%', fontStyle: 'italic',
            alignSelf: 'flex-start',
          }}>
            …
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div style={{
        padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'center',
        backgroundColor: '#ffffff', borderTop: '0.5px solid #e0e0e0',
        flexShrink: 0,
      }}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !loading) handleSend() }}
          placeholder="Ask Noorie…"
          style={{
            flex: 1, border: '0.5px solid #e0e0e0', borderRadius: 20,
            padding: '8px 14px', fontSize: 13, outline: 'none',
            backgroundColor: '#f9f9f9',
          }}
        />
        <button
          onClick={handleMic}
          aria-label="Voice input"
          style={{
            width: 34, height: 34, borderRadius: '50%',
            border: `0.5px solid ${isListening ? '#034325' : '#e0e0e0'}`,
            background: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0, flexShrink: 0,
          }}
        >
          <svg width="14" height="18" viewBox="0 0 14 18" fill="none" aria-hidden="true">
            <path
              d="M7 11a3 3 0 0 0 3-3V4a3 3 0 1 0-6 0v4a3 3 0 0 0 3 3z"
              stroke={isListening ? '#034325' : '#6b7280'}
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <path
              d="M1 8a6 6 0 0 0 12 0M7 14v3"
              stroke={isListening ? '#034325' : '#6b7280'}
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </button>
        <button
          onClick={handleSend}
          disabled={sendDisabled}
          aria-label="Send message"
          style={{
            width: 34, height: 34, borderRadius: '50%',
            border: 'none', backgroundColor: '#034325',
            cursor: sendDisabled ? 'not-allowed' : 'pointer',
            opacity: sendDisabled ? 0.5 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0, flexShrink: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M2 12L12 7L2 2V6L9 7L2 8V12Z" fill="#ffffff" />
          </svg>
        </button>
      </div>
    </div>
  )
}
