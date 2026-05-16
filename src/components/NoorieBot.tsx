import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '../stores/authStore'
import { supabase } from '../lib/supabase'
import newlookLogo from '../assets/newlook-logo.jpg'

interface Message {
  role: 'noorie' | 'user'
  text: string
}

export default function NoorieBot() {
  const staffRecord = useAuthStore(s => s.staffRecord)
  if (staffRecord?.role !== 'owner') return null
  const salonName = useAuthStore(s => s.salonName)
  const ownerName = staffRecord?.name ?? 'there'

  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [salonContext, setSalonContext] = useState<string>('')
  const [contextLoading, setContextLoading] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const prevContextLoadingRef = useRef(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    setMessages([{
      role: 'noorie',
      text: `Hi ${ownerName}! I am Noorie. Give me a moment while I load your salon data...`,
    }])
  }, [ownerName])

  useEffect(() => {
    if (prevContextLoadingRef.current && !contextLoading) {
      setMessages(m => [...m, { role: 'noorie', text: 'Ready! Ask me anything about your salon.' }])
    }
    prevContextLoadingRef.current = contextLoading
  }, [contextLoading])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (isOpen && !salonContext) {
      fetchSalonContext()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const fetchSalonContext = async () => {
    if (!staffRecord?.salon_id) return
    setContextLoading(true)
    const salonId = staffRecord.salon_id

    const today = new Date()
    const dubaiOffset = 4 * 60
    const dubaiNow = new Date(today.getTime() + (dubaiOffset - today.getTimezoneOffset()) * 60000)
    const todayYMD = dubaiNow.toISOString().split('T')[0]
    const todayStart = `${todayYMD}T00:00:00+04:00`
    const todayEnd = `${todayYMD}T23:59:59+04:00`

    const weekDay = (dubaiNow.getUTCDay() + 6) % 7
    const mondayMs = dubaiNow.getTime() - weekDay * 86400000
    const mondayYMD = new Date(mondayMs).toISOString().split('T')[0]
    const weekStart = `${mondayYMD}T00:00:00+04:00`
    const sundayYMD = new Date(mondayMs + 6 * 86400000).toISOString().split('T')[0]
    const weekEnd = `${sundayYMD}T23:59:59+04:00`

    const month = dubaiNow.getUTCMonth()
    const year = dubaiNow.getUTCFullYear()
    const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01T00:00:00+04:00`
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59+04:00`
    const yearStart = `${year}-01-01T00:00:00+04:00`
    const yearEnd = `${year}-12-31T23:59:59+04:00`

    try {
      const [apptRes, todayPayRes, weekPayRes, monthPayRes, yearPayRes, unpaidRes, expensesRes, clientsRes] = await Promise.all([

        // 1. Today's appointments
        supabase.from('appointments')
          .select('id, starts_at, status, is_walk_in, clients(name), staff(name), appointment_services(price, services(name))')
          .eq('salon_id', salonId)
          .gte('starts_at', todayStart)
          .lte('starts_at', todayEnd)
          .order('starts_at'),

        // 2. Today's payments
        supabase.from('payments')
          .select('amount, method')
          .eq('salon_id', salonId)
          .eq('status', 'completed')
          .gte('created_at', todayStart)
          .lte('created_at', todayEnd),

        // 3. This week's payments
        supabase.from('payments')
          .select('amount')
          .eq('salon_id', salonId)
          .eq('status', 'completed')
          .gte('created_at', weekStart)
          .lte('created_at', weekEnd),

        // 4. This month's payments
        supabase.from('payments')
          .select('amount')
          .eq('salon_id', salonId)
          .eq('status', 'completed')
          .gte('created_at', monthStart)
          .lte('created_at', monthEnd),

        // 5. This year's payments
        supabase.from('payments')
          .select('amount')
          .eq('salon_id', salonId)
          .eq('status', 'completed')
          .gte('created_at', yearStart)
          .lte('created_at', yearEnd),

        // 6. Outstanding unpaid appointments
        supabase.from('appointments')
          .select('id, starts_at, clients(name), appointment_services(price)')
          .eq('salon_id', salonId)
          .eq('status', 'completed')
          .order('starts_at', { ascending: false })
          .limit(20),

        // 7. This month's expenses
        supabase.from('salon_expenses')
          .select('category, name, amount')
          .eq('salon_id', salonId)
          .eq('month', month + 1)
          .eq('year', year),

        // 8. Top clients this month
        supabase.from('appointments')
          .select('client_id, clients(name), payments(amount, status)')
          .eq('salon_id', salonId)
          .eq('status', 'completed')
          .gte('starts_at', monthStart)
          .lte('starts_at', monthEnd),
      ])

      // Build today's appointment summary
      const appts = apptRes.data ?? []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const apptLines = appts.map((a: any) => {
        const clientName = a.clients?.name ?? 'Walk-in'
        const staffName = a.staff?.name ?? 'Unassigned'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const services = (a.appointment_services ?? []).map((s: any) => s.services?.name).filter(Boolean).join(', ')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const totalPaid = (a.appointment_services ?? []).reduce((sum: number, s: any) => sum + (s.price ?? 0), 0)
        const time = new Date(a.starts_at).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' })
        return `  - ${time}: ${clientName} with ${staffName} — ${services || 'no services'} (AED ${totalPaid}, status: ${a.status})`
      }).join('\n')

      // Revenue totals
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const todayRev = (todayPayRes.data ?? []).reduce((s: number, p: any) => s + (p.amount ?? 0), 0)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const weekRev = (weekPayRes.data ?? []).reduce((s: number, p: any) => s + (p.amount ?? 0), 0)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const monthRev = (monthPayRes.data ?? []).reduce((s: number, p: any) => s + (p.amount ?? 0), 0)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const yearRev = (yearPayRes.data ?? []).reduce((s: number, p: any) => s + (p.amount ?? 0), 0)

      // Unpaid balances — find appointments where sum of payments < sum of service prices
      const unpaidAppts = unpaidRes.data ?? []
      const unpaidLines: string[] = []
      for (const a of unpaidAppts) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const totalDue = ((a as any).appointment_services ?? []).reduce((s: number, sv: any) => s + (sv.price ?? 0), 0)
        if (totalDue > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const clientName = (a as any).clients?.name ?? 'Unknown'
          const date = new Date(a.starts_at as string).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', timeZone: 'Asia/Dubai' })
          unpaidLines.push(`  - ${clientName}: AED ${totalDue} (${date})`)
        }
      }

      // Expenses
      const expenses = expensesRes.data ?? []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fixedTotal = expenses.filter((e: any) => e.category === 'fixed').reduce((s: number, e: any) => s + (e.amount ?? 0), 0)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const variableTotal = expenses.filter((e: any) => e.category === 'variable').reduce((s: number, e: any) => s + (e.amount ?? 0), 0)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const oneTimeTotal = expenses.filter((e: any) => e.category === 'one_time').reduce((s: number, e: any) => s + (e.amount ?? 0), 0)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const expenseLines = expenses.map((e: any) => `  - ${e.name}: AED ${e.amount} (${e.category})`).join('\n')

      // Top clients this month
      const clientSpend: Record<string, number> = {}
      for (const a of (clientsRes.data ?? [])) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const name = (a as any).clients?.name ?? 'Unknown'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const paid = ((a as any).payments ?? []).filter((p: any) => p.status === 'completed').reduce((s: number, p: any) => s + (p.amount ?? 0), 0)
        clientSpend[name] = (clientSpend[name] ?? 0) + paid
      }
      const topClients = Object.entries(clientSpend).sort((a, b) => b[1] - a[1]).slice(0, 5)
      const topClientLines = topClients.map(([name, spend], i) => `  ${i + 1}. ${name}: AED ${spend}`).join('\n')

      // Top runner today
      const staffRevToday: Record<string, number> = {}
      for (const a of appts) {
        if (a.status !== 'completed') continue
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const name = (a as any).staff?.name ?? 'Unassigned'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rev = ((a as any).appointment_services ?? []).reduce((s: number, sv: any) => s + (sv.price ?? 0), 0)
        staffRevToday[name] = (staffRevToday[name] ?? 0) + rev
      }
      const topRunnerToday = Object.entries(staffRevToday).sort((a, b) => b[1] - a[1])[0]

      // Build the context string
      const context = `
SALON DATA FOR ${staffRecord?.name ?? 'Owner'} — ${new Date().toLocaleDateString('en-AE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dubai' })}

REVENUE:
- Today: AED ${todayRev.toFixed(2)}
- This week (Mon-Sun): AED ${weekRev.toFixed(2)}
- This month: AED ${monthRev.toFixed(2)}
- This year: AED ${yearRev.toFixed(2)}

TODAY'S APPOINTMENTS (${appts.length} total):
${apptLines || '  No appointments today'}

TOP RUNNER TODAY: ${topRunnerToday ? `${topRunnerToday[0]} with AED ${topRunnerToday[1]}` : 'No completed appointments today'}

TOP 5 CLIENTS THIS MONTH:
${topClientLines || '  No data'}

OUTSTANDING BALANCES (recent completed appointments with service prices):
${unpaidLines.slice(0, 5).join('\n') || '  None found'}

THIS MONTH EXPENSES:
- Fixed: AED ${fixedTotal}
- Variable: AED ${variableTotal}
- One-time: AED ${oneTimeTotal}
- Total: AED ${(fixedTotal + variableTotal + oneTimeTotal).toFixed(2)}
${expenseLines ? '\nExpense details:\n' + expenseLines : ''}
`.trim()

      setSalonContext(context)
    } catch (err) {
      console.error('NoorieBot context fetch failed:', err)
      setSalonContext('Salon data could not be loaded. Answer based on general salon knowledge only.')
    } finally {
      setContextLoading(false)
    }
  }

  async function handleSend() {
    const trimmed = input.trim()
    if (!trimmed || loading) return

    const userMsg: Message = { role: 'user', text: trimmed }
    const next: Message[] = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setLoading(true)

    try {
      const systemPrompt = `You are Noorie, the AI assistant for ${salonName ?? 'this salon'}. You have access to real-time salon data shown below. Answer questions directly and concisely using this data. Be friendly and specific — use actual names, dates, and AED amounts from the data. If the answer is not in the data, say so honestly.

${salonContext || 'Salon data is loading...'}

Rules:
- Always answer in 1-3 sentences unless more detail is genuinely needed
- Use AED for all currency amounts
- Use Dubai timezone for all times and dates
- Never invent data that is not in the context above`

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
          system: systemPrompt,
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
