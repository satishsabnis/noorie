import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '../stores/authStore'
import { supabase } from '../lib/supabase'
import newlookLogo from '../assets/newlook-logo.jpg'

interface Message {
  role: 'noorie' | 'user'
  text: string
}

interface ToolInput {
  start_date?: string
  end_date?: string
  period?: string
  group_by?: string
  mode?: string
  limit?: number
  days_since_visit?: number
  staff_name?: string
  sort_by?: string
  category?: string
  horizon?: string
  basis?: string
  date?: string
  range?: string
}

// ── Date range helper ────────────────────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function dubaiNowDate(): Date {
  return new Date(Date.now() + 4 * 60 * 60 * 1000)
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

function getDubaiDateRange(period: string, start_date?: string, end_date?: string): { start: string; end: string } {
  const now = dubaiNowDate()
  const ty = now.getUTCFullYear()
  const tm = now.getUTCMonth()
  const td = now.getUTCDate()

  const wrap = (sYmd: string, eYmd: string) => ({
    start: `${sYmd}T00:00:00+04:00`,
    end:   `${eYmd}T23:59:59+04:00`,
  })

  if (period === 'today')   return wrap(ymd(now), ymd(now))
  if (period === 'yesterday') {
    const y = new Date(Date.UTC(ty, tm, td - 1))
    return wrap(ymd(y), ymd(y))
  }
  if (period === 'week') {
    const dayIdx = (now.getUTCDay() + 6) % 7
    const mon = new Date(Date.UTC(ty, tm, td - dayIdx))
    const sun = new Date(Date.UTC(ty, tm, td - dayIdx + 6))
    return wrap(ymd(mon), ymd(sun))
  }
  if (period === 'last_week') {
    const dayIdx = (now.getUTCDay() + 6) % 7
    const mon = new Date(Date.UTC(ty, tm, td - dayIdx - 7))
    const sun = new Date(Date.UTC(ty, tm, td - dayIdx - 1))
    return wrap(ymd(mon), ymd(sun))
  }
  if (period === 'month') {
    const first = new Date(Date.UTC(ty, tm, 1))
    const last  = new Date(Date.UTC(ty, tm + 1, 0))
    return wrap(ymd(first), ymd(last))
  }
  if (period === 'last_month') {
    const first = new Date(Date.UTC(ty, tm - 1, 1))
    const last  = new Date(Date.UTC(ty, tm, 0))
    return wrap(ymd(first), ymd(last))
  }
  if (period === 'quarter') {
    const qStart = Math.floor(tm / 3) * 3
    const first = new Date(Date.UTC(ty, qStart, 1))
    const last  = new Date(Date.UTC(ty, qStart + 3, 0))
    return wrap(ymd(first), ymd(last))
  }
  if (period === 'last_quarter') {
    const qStart = Math.floor(tm / 3) * 3 - 3
    const first = new Date(Date.UTC(ty, qStart, 1))
    const last  = new Date(Date.UTC(ty, qStart + 3, 0))
    return wrap(ymd(first), ymd(last))
  }
  if (period === 'year')        return wrap(`${ty}-01-01`, `${ty}-12-31`)
  if (period === 'last_year')   return wrap(`${ty - 1}-01-01`, `${ty - 1}-12-31`)
  if (period === 'custom' && start_date && end_date) return wrap(start_date, end_date)
  // Default: today
  return wrap(ymd(now), ymd(now))
}

// ── Tool definitions for Anthropic ───────────────────────────────────────────

const TOOLS_ARRAY = [
  {
    name: 'get_revenue',
    description: 'Total payments collected and appointment count for a period. Optional group_by buckets totals per day/week/month/quarter/year.',
    input_schema: {
      type: 'object',
      properties: {
        period: { type: 'string', description: 'today | yesterday | week | last_week | month | last_month | quarter | last_quarter | year | last_year | custom' },
        start_date: { type: 'string', description: 'YYYY-MM-DD for custom period' },
        end_date: { type: 'string', description: 'YYYY-MM-DD for custom period' },
        group_by: { type: 'string', description: 'day | week | month | quarter | year' },
      },
      required: ['period'],
    },
  },
  {
    name: 'get_expenses',
    description: 'Salon expenses for a period, with category breakdown (fixed, variable, one_time).',
    input_schema: {
      type: 'object',
      properties: {
        period: { type: 'string', description: 'today | yesterday | week | last_week | month | last_month | quarter | last_quarter | year | last_year | custom' },
        start_date: { type: 'string' },
        end_date: { type: 'string' },
        category: { type: 'string', description: 'fixed | variable | one_time' },
      },
      required: ['period'],
    },
  },
  {
    name: 'get_profit',
    description: 'Net profit (revenue minus expenses) for a period. Use group_by for trend.',
    input_schema: {
      type: 'object',
      properties: {
        period: { type: 'string' },
        start_date: { type: 'string' },
        end_date: { type: 'string' },
        group_by: { type: 'string' },
      },
      required: ['period'],
    },
  },
  {
    name: 'get_clients',
    description: 'Client analytics. Modes: top_spenders, lapsed, new, at_risk, single_visit, retention.',
    input_schema: {
      type: 'object',
      properties: {
        mode: { type: 'string', description: 'top_spenders | lapsed | new | at_risk | single_visit | retention' },
        period: { type: 'string', description: 'Used by top_spenders, new, retention' },
        start_date: { type: 'string' },
        end_date: { type: 'string' },
        limit: { type: 'number', description: 'Result cap; default 10' },
        days_since_visit: { type: 'number', description: 'Lapsed threshold in days; default 30' },
      },
      required: ['mode'],
    },
  },
  {
    name: 'get_staff_performance',
    description: 'Per-staff revenue and appointment count for a period. Optional comparison to previous period.',
    input_schema: {
      type: 'object',
      properties: {
        period: { type: 'string' },
        start_date: { type: 'string' },
        end_date: { type: 'string' },
        staff_name: { type: 'string', description: 'Filter to a single staff member' },
        mode: { type: 'string', description: 'compare = include % change vs previous period' },
      },
      required: ['period'],
    },
  },
  {
    name: 'get_service_analysis',
    description: 'Per-service revenue, visit count, and average price for a period.',
    input_schema: {
      type: 'object',
      properties: {
        period: { type: 'string' },
        start_date: { type: 'string' },
        end_date: { type: 'string' },
        sort_by: { type: 'string', description: 'revenue | count' },
      },
      required: ['period'],
    },
  },
  {
    name: 'get_schedule',
    description: 'Time-sorted appointment schedule for a date range (default today), plus free-slot gaps.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD; default today' },
        range: { type: 'string', description: 'today | tomorrow | week' },
      },
    },
  },
  {
    name: 'get_outstanding_balances',
    description: 'Completed appointments where appointment_services.price total exceeds payments collected.',
    input_schema: {
      type: 'object',
      properties: {
        sort_by: { type: 'string', description: 'amount | date; default amount' },
        limit: { type: 'number', description: 'Default 10' },
      },
    },
  },
  {
    name: 'get_client_retention',
    description: 'Retention rate between previous and current period (default month vs last month).',
    input_schema: {
      type: 'object',
      properties: {
        period: { type: 'string', description: 'Current period; default month' },
      },
    },
  },
  {
    name: 'get_market_pulse',
    description: 'Latest competitor scan report for the salon.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_forecast',
    description: 'Project next month revenue based on recent average daily revenue. basis=30 or 90 days.',
    input_schema: {
      type: 'object',
      properties: {
        basis: { type: 'string', description: '30 or 90 (days)' },
      },
    },
  },
]

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

  const bottomRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    setMessages([{
      role: 'noorie',
      text: `Hi ${ownerName}! I am Noorie, your AI salon assistant. Ask me anything about your business.`,
    }])
  }, [ownerName])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // ── Tool executor ─────────────────────────────────────────────────────────

  async function executeTool(toolName: string, input: ToolInput, salonId: string): Promise<string> {
    try {
      // ── get_revenue ───────────────────────────────────────────────────────
      if (toolName === 'get_revenue') {
        const period = input.period ?? 'today'
        const { start, end } = getDubaiDateRange(period, input.start_date, input.end_date)
        const [{ data: pays, error: payErr }, { data: appts, error: apptErr }] = await Promise.all([
          supabase.from('payments').select('amount, created_at').eq('salon_id', salonId).eq('status', 'completed').gte('created_at', start).lte('created_at', end),
          supabase.from('appointments').select('id, starts_at').eq('salon_id', salonId).gte('starts_at', start).lte('starts_at', end),
        ])
        if (payErr) return `Error fetching data: ${payErr.message}`
        if (apptErr) return `Error fetching data: ${apptErr.message}`
        const total = (pays ?? []).reduce((s, p) => s + ((p.amount as number) ?? 0), 0)
        if (!input.group_by) {
          return `Revenue (${period}): AED ${total.toFixed(2)} from ${(pays ?? []).length} payments. Appointment count: ${(appts ?? []).length}.`
        }
        // group_by buckets
        const buckets: Record<string, { rev: number; appts: number }> = {}
        const bucketKey = (iso: string) => {
          const d = new Date(new Date(iso).getTime() + 4 * 60 * 60 * 1000)
          if (input.group_by === 'day')     return ymd(d)
          if (input.group_by === 'week')    return `Wk ${pad2(Math.ceil((d.getUTCDate()) / 7))} ${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`
          if (input.group_by === 'month')   return `${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} ${d.getUTCFullYear()}`
          if (input.group_by === 'quarter') return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`
          if (input.group_by === 'year')    return `${d.getUTCFullYear()}`
          return ymd(d)
        }
        for (const p of pays ?? []) {
          const k = bucketKey(p.created_at as string)
          if (!buckets[k]) buckets[k] = { rev: 0, appts: 0 }
          buckets[k].rev += (p.amount as number) ?? 0
        }
        for (const a of appts ?? []) {
          const k = bucketKey(a.starts_at as string)
          if (!buckets[k]) buckets[k] = { rev: 0, appts: 0 }
          buckets[k].appts += 1
        }
        const lines = Object.entries(buckets).map(([k, v]) => `${k}: AED ${v.rev.toFixed(2)} (${v.appts} appointments)`).join('\n')
        return `Revenue (${period}) — total AED ${total.toFixed(2)}:\n${lines || 'No data'}`
      }

      // ── get_expenses ──────────────────────────────────────────────────────
      if (toolName === 'get_expenses') {
        const period = input.period ?? 'month'
        const { start, end } = getDubaiDateRange(period, input.start_date, input.end_date)
        // Convert range into month+year filter. salon_expenses are keyed by month/year ints.
        const startD = new Date(start)
        const endD = new Date(end)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = supabase.from('salon_expenses').select('category, name, amount, month, year').eq('salon_id', salonId)
        if (input.category) q = q.eq('category', input.category)
        const { data, error } = await q
        if (error) return `Error fetching data: ${error.message}`
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const inRange = (data ?? []).filter((e: any) => {
          const eDate = new Date(Date.UTC(e.year, e.month - 1, 1))
          return eDate >= new Date(Date.UTC(startD.getUTCFullYear(), startD.getUTCMonth(), 1))
              && eDate <= new Date(Date.UTC(endD.getUTCFullYear(), endD.getUTCMonth(), 1))
        })
        if (inRange.length === 0) return `No expenses found for ${period}.`
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sumBy = (cat: string) => inRange.filter((e: any) => e.category === cat).reduce((s: number, e: any) => s + (e.amount ?? 0), 0)
        const fixed = sumBy('fixed')
        const variable = sumBy('variable')
        const onetime = sumBy('one_time')
        const total = fixed + variable + onetime
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items = inRange.map((e: any) => `- ${e.name} (${e.category}): AED ${e.amount}`).join('\n')
        return `Expenses (${period}):\nFixed: AED ${fixed.toFixed(2)}, Variable: AED ${variable.toFixed(2)}, One-time: AED ${onetime.toFixed(2)}. Total: AED ${total.toFixed(2)}.\nLine items:\n${items}`
      }

      // ── get_profit ────────────────────────────────────────────────────────
      if (toolName === 'get_profit') {
        const period = input.period ?? 'month'
        const { start, end } = getDubaiDateRange(period, input.start_date, input.end_date)
        const { data: pays } = await supabase.from('payments').select('amount').eq('salon_id', salonId).eq('status', 'completed').gte('created_at', start).lte('created_at', end)
        const startD = new Date(start), endD = new Date(end)
        const { data: exps } = await supabase.from('salon_expenses').select('amount, month, year').eq('salon_id', salonId)
        const revenue = (pays ?? []).reduce((s, p) => s + ((p.amount as number) ?? 0), 0)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const expenses = (exps ?? []).filter((e: any) => {
          const eDate = new Date(Date.UTC(e.year, e.month - 1, 1))
          return eDate >= new Date(Date.UTC(startD.getUTCFullYear(), startD.getUTCMonth(), 1))
              && eDate <= new Date(Date.UTC(endD.getUTCFullYear(), endD.getUTCMonth(), 1))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }).reduce((s: number, e: any) => s + (e.amount ?? 0), 0)
        const net = revenue - expenses
        return `Profit (${period}): Revenue AED ${revenue.toFixed(2)}, Expenses AED ${expenses.toFixed(2)}, Net AED ${net.toFixed(2)}.`
      }

      // ── get_clients ───────────────────────────────────────────────────────
      if (toolName === 'get_clients') {
        const mode = input.mode ?? 'top_spenders'
        const limit = input.limit ?? 10

        if (mode === 'top_spenders') {
          const period = input.period ?? 'month'
          const { start, end } = getDubaiDateRange(period, input.start_date, input.end_date)
          const { data, error } = await supabase
            .from('appointments')
            .select('client_id, clients(name), payments(amount, status)')
            .eq('salon_id', salonId).eq('status', 'completed')
            .gte('starts_at', start).lte('starts_at', end)
          if (error) return `Error fetching data: ${error.message}`
          const map: Record<string, { visits: Set<string>; spend: number }> = {}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const a of (data ?? []) as any[]) {
            const name = a.clients?.name ?? 'Unknown'
            if (!map[name]) map[name] = { visits: new Set(), spend: 0 }
            map[name].visits.add(a.client_id as string)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const p of (a.payments ?? []) as any[]) {
              if (p.status === 'completed') map[name].spend += (p.amount ?? 0)
            }
          }
          const sorted = Object.entries(map).sort((a, b) => b[1].spend - a[1].spend).slice(0, limit)
          if (sorted.length === 0) return `No completed appointments for ${period}.`
          return `Top spenders (${period}):\n${sorted.map(([n, v], i) => `${i + 1}. ${n}: AED ${v.spend.toFixed(2)} (${v.visits.size} visits)`).join('\n')}`
        }

        if (mode === 'lapsed') {
          const days = input.days_since_visit ?? 30
          const cutoff = new Date(Date.now() - days * 86400000).toISOString()
          const { data, error } = await supabase
            .from('clients').select('id, name, last_visit_at, visit_count').eq('salon_id', salonId)
            .lt('last_visit_at', cutoff).order('last_visit_at', { ascending: false })
          if (error) return `Error fetching data: ${error.message}`
          if (!data || data.length === 0) return `No clients have lapsed more than ${days} days.`
          const top = data.slice(0, limit)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return `Lapsed clients (>${days} days):\n${top.map((c: any, i: number) => `${i + 1}. ${c.name} — last visit ${new Date(c.last_visit_at).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })} (${c.visit_count ?? 0} total visits)`).join('\n')}`
        }

        if (mode === 'new') {
          const period = input.period ?? 'month'
          const { start, end } = getDubaiDateRange(period, input.start_date, input.end_date)
          const { data, error } = await supabase.from('clients').select('id, name').eq('salon_id', salonId).gte('created_at', start).lte('created_at', end)
          if (error) return `Error fetching data: ${error.message}`
          if (!data || data.length === 0) return `No new clients in ${period}.`
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return `New clients (${period}): ${data.length} total.\n${(data as any[]).slice(0, limit).map((c, i) => `${i + 1}. ${c.name}`).join('\n')}`
        }

        if (mode === 'at_risk') {
          const days = input.days_since_visit ?? 30
          const cutoff = new Date(Date.now() - days * 86400000).toISOString()
          const { data: lapsed } = await supabase.from('clients').select('id, name, last_visit_at, visit_count').eq('salon_id', salonId).lt('last_visit_at', cutoff)
          if (!lapsed || lapsed.length === 0) return `No lapsed clients.`
          const clientIds = lapsed.map(c => c.id as string)
          const { data: pays } = await supabase.from('payments').select('client_id, amount').in('client_id', clientIds)
          const spend: Record<string, number> = {}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const p of (pays ?? []) as any[]) {
            spend[p.client_id] = (spend[p.client_id] ?? 0) + (p.amount ?? 0)
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const withSpend = (lapsed as any[]).map(c => ({ ...c, spend: spend[c.id] ?? 0 }))
          // Top 20% by spend
          withSpend.sort((a, b) => b.spend - a.spend)
          const top20 = withSpend.slice(0, Math.max(1, Math.ceil(withSpend.length * 0.2))).slice(0, limit)
          if (top20.length === 0) return `No high-value lapsed clients.`
          return `At-risk clients (lapsed top spenders):\n${top20.map((c, i) => `${i + 1}. ${c.name}: AED ${c.spend.toFixed(2)} lifetime, last visit ${new Date(c.last_visit_at).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })}`).join('\n')}`
        }

        if (mode === 'single_visit') {
          const { data, error } = await supabase.from('clients').select('id, name, visit_count').eq('salon_id', salonId).eq('visit_count', 1)
          if (error) return `Error fetching data: ${error.message}`
          if (!data || data.length === 0) return `No single-visit clients.`
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return `Single-visit clients: ${data.length} total.\n${(data as any[]).slice(0, limit).map((c, i) => `${i + 1}. ${c.name}`).join('\n')}`
        }

        if (mode === 'retention') {
          // Delegated to get_client_retention computation
          return await executeTool('get_client_retention', { period: input.period }, salonId)
        }

        return `Unknown client mode: ${mode}`
      }

      // ── get_staff_performance ─────────────────────────────────────────────
      if (toolName === 'get_staff_performance') {
        const period = input.period ?? 'month'
        const { start, end } = getDubaiDateRange(period, input.start_date, input.end_date)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fetchByRange = async (s: string, e: string): Promise<Record<string, { rev: number; appts: Set<string> }>> => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let q: any = supabase.from('appointment_services')
            .select('appointment_id, price, staff!inner(name), appointments!inner(salon_id, status, starts_at)')
            .eq('appointments.salon_id', salonId)
            .eq('appointments.status', 'completed')
            .gte('appointments.starts_at', s)
            .lte('appointments.starts_at', e)
          if (input.staff_name) q = q.eq('staff.name', input.staff_name)
          const { data } = await q
          const map: Record<string, { rev: number; appts: Set<string> }> = {}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const r of (data ?? []) as any[]) {
            const name = r.staff?.name ?? 'Unassigned'
            if (!map[name]) map[name] = { rev: 0, appts: new Set() }
            map[name].rev += (r.price ?? 0)
            map[name].appts.add(r.appointment_id as string)
          }
          return map
        }
        const current = await fetchByRange(start, end)
        const sorted = Object.entries(current).sort((a, b) => b[1].rev - a[1].rev)
        if (sorted.length === 0) return `No completed services for ${period}.`

        if (input.mode === 'compare') {
          // Compute previous period range
          let prevPeriod = period
          if (period === 'today') prevPeriod = 'yesterday'
          else if (period === 'week') prevPeriod = 'last_week'
          else if (period === 'month') prevPeriod = 'last_month'
          else if (period === 'quarter') prevPeriod = 'last_quarter'
          else if (period === 'year') prevPeriod = 'last_year'
          const prevRange = getDubaiDateRange(prevPeriod)
          const previous = await fetchByRange(prevRange.start, prevRange.end)
          const lines = sorted.map(([n, v], i) => {
            const prev = previous[n]?.rev ?? 0
            const pct = prev > 0 ? ((v.rev - prev) / prev * 100) : null
            const pctStr = pct === null ? ' (new)' : ` (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% vs ${prevPeriod})`
            return `${i + 1}. ${n}: AED ${v.rev.toFixed(2)}, ${v.appts.size} appointments${pctStr}`
          }).join('\n')
          return `Staff performance (${period}):\n${lines}`
        }

        return `Staff performance (${period}):\n${sorted.map(([n, v], i) => `${i + 1}. ${n}: AED ${v.rev.toFixed(2)}, ${v.appts.size} appointments`).join('\n')}`
      }

      // ── get_service_analysis ──────────────────────────────────────────────
      if (toolName === 'get_service_analysis') {
        const period = input.period ?? 'month'
        const { start, end } = getDubaiDateRange(period, input.start_date, input.end_date)
        const { data, error } = await supabase
          .from('appointment_services')
          .select('price, services!inner(name), appointments!inner(salon_id, status, starts_at)')
          .eq('appointments.salon_id', salonId)
          .eq('appointments.status', 'completed')
          .gte('appointments.starts_at', start)
          .lte('appointments.starts_at', end)
        if (error) return `Error fetching data: ${error.message}`
        const map: Record<string, { rev: number; count: number }> = {}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const r of (data ?? []) as any[]) {
          const name = r.services?.name ?? 'Unknown'
          if (!map[name]) map[name] = { rev: 0, count: 0 }
          map[name].rev += (r.price ?? 0)
          map[name].count += 1
        }
        if (Object.keys(map).length === 0) return `No completed services for ${period}.`
        const sortBy = input.sort_by === 'count' ? 'count' : 'revenue'
        const sorted = Object.entries(map).sort((a, b) =>
          sortBy === 'count' ? b[1].count - a[1].count : b[1].rev - a[1].rev
        )
        return `Services (${period}, sorted by ${sortBy}):\n${sorted.map(([n, v], i) => `${i + 1}. ${n}: AED ${v.rev.toFixed(2)} total, ${v.count} visits, avg AED ${(v.rev / v.count).toFixed(2)}`).join('\n')}`
      }

      // ── get_schedule ──────────────────────────────────────────────────────
      if (toolName === 'get_schedule') {
        let start: string, end: string
        if (input.date) {
          start = `${input.date}T00:00:00+04:00`
          end   = `${input.date}T23:59:59+04:00`
        } else if (input.range === 'tomorrow') {
          const now = dubaiNowDate()
          const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
          start = `${ymd(t)}T00:00:00+04:00`
          end   = `${ymd(t)}T23:59:59+04:00`
        } else if (input.range === 'week') {
          const r = getDubaiDateRange('week')
          start = r.start; end = r.end
        } else {
          const r = getDubaiDateRange('today')
          start = r.start; end = r.end
        }
        const { data, error } = await supabase
          .from('appointments')
          .select('id, starts_at, ends_at, status, clients(name), staff(name), appointment_services(services(name))')
          .eq('salon_id', salonId)
          .gte('starts_at', start)
          .lte('starts_at', end)
          .order('starts_at')
        if (error) return `Error fetching data: ${error.message}`
        if (!data || data.length === 0) return `No appointments for this range.`
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lines = (data as any[]).map(a => {
          const time = new Date(a.starts_at).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' })
          const client = a.clients?.name ?? 'Walk-in'
          const staff = a.staff?.name ?? 'Unassigned'
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const services = (a.appointment_services ?? []).map((s: any) => s.services?.name).filter(Boolean).join(', ')
          return `${time}: ${client} with ${staff} — ${services || 'no services'} (${a.status})`
        }).join('\n')
        // Compute gaps per staff (simple: between 09:00 and 21:00)
        const OPEN = 9 * 60, CLOSE = 21 * 60
        const byStaff: Record<string, { start: number; end: number }[]> = {}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const a of data as any[]) {
          const sName = a.staff?.name ?? 'Unassigned'
          const s = new Date(a.starts_at)
          const e = new Date(a.ends_at)
          const sM = parseInt(s.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai', hour12: false }).split(':').reduce((acc: number, x: string, i: number) => i === 0 ? Number(x) * 60 : acc + Number(x), 0).toString())
          const eM = parseInt(e.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai', hour12: false }).split(':').reduce((acc: number, x: string, i: number) => i === 0 ? Number(x) * 60 : acc + Number(x), 0).toString())
          if (!byStaff[sName]) byStaff[sName] = []
          byStaff[sName].push({ start: sM, end: eM })
        }
        const gapLines: string[] = []
        for (const [name, bookings] of Object.entries(byStaff)) {
          const sorted = bookings.slice().sort((a, b) => a.start - b.start)
          let cursor = OPEN
          for (const b of sorted) {
            if (b.start > cursor) gapLines.push(`${name} free ${pad2(Math.floor(cursor / 60))}:${pad2(cursor % 60)}–${pad2(Math.floor(b.start / 60))}:${pad2(b.start % 60)}`)
            cursor = Math.max(cursor, b.end)
          }
          if (cursor < CLOSE) gapLines.push(`${name} free ${pad2(Math.floor(cursor / 60))}:${pad2(cursor % 60)}–${pad2(Math.floor(CLOSE / 60))}:${pad2(CLOSE % 60)}`)
        }
        return `Appointments:\n${lines}\n\nGaps:\n${gapLines.join('\n') || 'No free slots'}`
      }

      // ── get_outstanding_balances ──────────────────────────────────────────
      if (toolName === 'get_outstanding_balances') {
        const limit = input.limit ?? 10
        const { data: appts, error } = await supabase
          .from('appointments')
          .select('id, starts_at, clients(name), appointment_services(price), payments(amount, status)')
          .eq('salon_id', salonId).eq('status', 'completed')
          .order('starts_at', { ascending: false }).limit(100)
        if (error) return `Error fetching data: ${error.message}`
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items: { client: string; date: string; amount: number; ts: number }[] = []
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const a of (appts ?? []) as any[]) {
          const due  = (a.appointment_services ?? []).reduce((s: number, sv: { price?: number | null }) => s + (sv.price ?? 0), 0)
          const paid = (a.payments ?? []).filter((p: { status?: string }) => p.status === 'completed').reduce((s: number, p: { amount?: number | null }) => s + (p.amount ?? 0), 0)
          const owed = due - paid
          if (owed > 0) {
            items.push({
              client: a.clients?.name ?? 'Unknown',
              date: new Date(a.starts_at).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' }),
              amount: owed,
              ts: new Date(a.starts_at).getTime(),
            })
          }
        }
        if (items.length === 0) return `No outstanding balances.`
        const sortBy = input.sort_by === 'date' ? 'date' : 'amount'
        items.sort((a, b) => sortBy === 'date' ? b.ts - a.ts : b.amount - a.amount)
        const top = items.slice(0, limit)
        const total = items.reduce((s, i) => s + i.amount, 0)
        return `Outstanding balances:\n${top.map(i => `- ${i.client}: AED ${i.amount.toFixed(2)} (${i.date})`).join('\n')}\nTotal outstanding: AED ${total.toFixed(2)} across ${items.length} appointments.`
      }

      // ── get_client_retention ──────────────────────────────────────────────
      if (toolName === 'get_client_retention') {
        const period = input.period ?? 'month'
        const curr = getDubaiDateRange(period)
        let prevPeriod = 'last_month'
        if (period === 'week') prevPeriod = 'last_week'
        else if (period === 'quarter') prevPeriod = 'last_quarter'
        else if (period === 'year') prevPeriod = 'last_year'
        const prev = getDubaiDateRange(prevPeriod)

        const [{ data: currAppts }, { data: prevAppts }] = await Promise.all([
          supabase.from('appointments').select('client_id').eq('salon_id', salonId).eq('status', 'completed').gte('starts_at', curr.start).lte('starts_at', curr.end),
          supabase.from('appointments').select('client_id').eq('salon_id', salonId).eq('status', 'completed').gte('starts_at', prev.start).lte('starts_at', prev.end),
        ])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const currIds = new Set((currAppts ?? []).map((a: any) => a.client_id as string))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const prevIds = new Set((prevAppts ?? []).map((a: any) => a.client_id as string))
        const returning = [...prevIds].filter(id => currIds.has(id)).length
        const newOnes = [...currIds].filter(id => !prevIds.has(id)).length
        const rate = prevIds.size > 0 ? (returning / prevIds.size * 100) : 0
        return `Retention (${period} vs ${prevPeriod}): ${rate.toFixed(1)}%. ${returning} of ${prevIds.size} previous clients returned. ${newOnes} new clients this period.`
      }

      // ── get_market_pulse ──────────────────────────────────────────────────
      if (toolName === 'get_market_pulse') {
        const { data } = await supabase.from('competitor_reports').select('report, created_at').eq('salon_id', salonId).order('created_at', { ascending: false }).limit(1).maybeSingle()
        if (!data?.report) return `No competitor scan has been run yet. Run a scan from Admin.`
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = data.report as any
        const scanDate = new Date(data.created_at as string).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const compList = (r.competitors ?? []).map((c: any) => `- ${c.name ?? c.salon_name ?? '?'}: ${c.location ?? ''} ${c.price_range ?? ''}`).join('\n')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const trends = (r.trends ?? []).map((t: any) => `- ${typeof t === 'string' ? t : (t.trend ?? t.name ?? JSON.stringify(t))}`).join('\n')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const recs = (r.recommendations ?? []).map((rec: any) => `- ${typeof rec === 'string' ? rec : JSON.stringify(rec)}`).join('\n')
        return `Market Pulse (last scan ${scanDate}):\n\nCompetitors:\n${compList || 'None'}\n\nTrends:\n${trends || 'None'}\n\nPricing insights: ${r.pricing_insights ?? 'None'}\n\nRecommendations:\n${recs || 'None'}`
      }

      // ── get_forecast ──────────────────────────────────────────────────────
      if (toolName === 'get_forecast') {
        const basis = parseInt(input.basis ?? '30') || 30
        const since = new Date(Date.now() - basis * 86400000).toISOString()
        const { data: pays } = await supabase.from('payments').select('amount, created_at').eq('salon_id', salonId).eq('status', 'completed').gte('created_at', since)
        const totalRev = (pays ?? []).reduce((s, p) => s + ((p.amount as number) ?? 0), 0)
        const dailyAvg = totalRev / basis
        const now = dubaiNowDate()
        const nextMonth = now.getUTCMonth() + 1
        const nextMonthYear = nextMonth > 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear()
        const nextMonthIdx = nextMonth % 12
        const daysInNext = new Date(Date.UTC(nextMonthYear, nextMonthIdx + 1, 0)).getUTCDate()
        const projRev = dailyAvg * daysInNext
        const { data: exps } = await supabase.from('salon_expenses').select('amount, category').eq('salon_id', salonId).eq('month', nextMonthIdx + 1).eq('year', nextMonthYear)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fixedExp = (exps ?? []).filter((e: any) => e.category === 'fixed').reduce((s: number, e: any) => s + (e.amount ?? 0), 0)
        const projNet = projRev - fixedExp
        return `Forecast (basis: last ${basis} days, avg AED ${dailyAvg.toFixed(2)}/day): projected revenue next month AED ${projRev.toFixed(2)}, fixed expenses AED ${fixedExp.toFixed(2)}, projected net AED ${projNet.toFixed(2)}.`
      }

      return `Unknown tool: ${toolName}`
    } catch (err) {
      console.error('[NoorieBot] executeTool error:', err)
      return `Error fetching data: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  // ── Agentic handleSend ─────────────────────────────────────────────────────

  async function handleSend() {
    const trimmed = input.trim()
    if (!trimmed || loading) return

    const userMsg: Message = { role: 'user', text: trimmed }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setInput('')
    setLoading(true)

    const salonId = staffRecord?.salon_id
    if (!salonId) {
      setMessages(m => [...m, { role: 'noorie', text: 'Could not identify your salon. Please sign out and sign in again.' }])
      setLoading(false)
      return
    }

    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined
    if (!apiKey) {
      setMessages(m => [...m, { role: 'noorie', text: 'API key missing. Please contact support.' }])
      setLoading(false)
      return
    }

    const systemPrompt = `You are Noorie, the AI business assistant for ${salonName ?? 'this salon'} in Dubai, UAE. You have access to real-time salon data through tools. When asked a question, use the appropriate tool to fetch the data you need, then answer clearly and specifically with real numbers. Be friendly, direct, and concise. Always use AED for currency. Always use Dubai timezone. Today's date is ${new Date(Date.now() + 4 * 60 * 60 * 1000).toLocaleDateString('en-AE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}. Never invent data — if a tool returns no data, say so honestly. You can call multiple tools in sequence if needed to answer a question fully.`

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anthropicMessages: any[] = updatedMessages.map(m => ({
      role: m.role === 'noorie' ? 'assistant' : 'user',
      content: m.text,
    }))

    const MAX_ITERATIONS = 10
    let iterations = 0

    try {
      while (iterations < MAX_ITERATIONS) {
        iterations++

        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-5-20251001',
            max_tokens: 2000,
            system: systemPrompt,
            tools: TOOLS_ARRAY,
            messages: anthropicMessages,
          }),
        })

        if (!res.ok) throw new Error(`API error ${res.status}`)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = await res.json()

        if (data.stop_reason === 'end_turn') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const textBlock = (data.content as any[]).find((b: any) => b.type === 'text')
          const responseText = textBlock?.text ?? '(no response)'
          setMessages(m => [...m, { role: 'noorie', text: responseText }])
          break
        }

        if (data.stop_reason === 'tool_use') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const toolUseBlocks = (data.content as any[]).filter((b: any) => b.type === 'tool_use')

          anthropicMessages.push({ role: 'assistant', content: data.content })

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const toolResults: any[] = []
          for (const toolCall of toolUseBlocks) {
            const toolResult = await executeTool(toolCall.name, toolCall.input as ToolInput, salonId)
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolCall.id,
              content: toolResult,
            })
          }

          anthropicMessages.push({ role: 'user', content: toolResults })
          continue
        }

        break
      }

      if (iterations >= MAX_ITERATIONS) {
        setMessages(m => [...m, { role: 'noorie', text: 'I needed too many steps to answer that. Please try rephrasing your question.' }])
      }

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
