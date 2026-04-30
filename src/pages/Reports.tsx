import { useState, useEffect } from 'react'
import Topbar from '../components/Topbar'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

// ── Types ────────────────────────────────────────────────────────────────────

interface CycleSummary {
  period_month: number
  period_year: number
  total_basic_salary: number
  total_commission_earned: number
  total_advance_deductions: number
  total_net_payable: number
  staff_count: number
  most_recent_created_at: string
}

interface CyclePayrollRow {
  id: string
  staff_id: string
  staff_name: string
  staff_role: string
  basic_salary: number
  commission_earned: number
  advance_deductions: number
  net_payable: number
  period_month: number
  period_year: number
  created_at: string
}

interface SelectedCycle {
  period_month: number
  period_year: number
  rows: CyclePayrollRow[]
}

interface AdvanceRow {
  id: string
  staff_id: string
  amount: number | null
  note: string | null
  repayment_mode: string | null
  emi_months: number | null
  emi_amount: number | null
  amount_remaining: number | null
  status: string | null
}

// ── Constants ────────────────────────────────────────────────────────────────

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatMoney(n: number): string {
  return n.toLocaleString('en-AE', { maximumFractionDigits: 0 })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function getInitials(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0] ?? '').slice(0, 2).join('').toUpperCase()
}

function periodBounds(month: number, year: number): { start: Date; end: Date } {
  return { start: new Date(year, month - 1, 1), end: new Date(year, month, 0) }
}

function buildSlipHTML(opts: {
  salonName: string
  staffName: string
  staffRole: string
  month: number
  year: number
  basicSalary: number
  commissionEarned: number
  advanceDeductions: number
  netPayable: number
  advances: AdvanceRow[]
}): string {
  const { salonName, staffName, staffRole, month, year, basicSalary, commissionEarned, advanceDeductions, netPayable, advances } = opts
  const { start, end } = periodBounds(month, year)
  const periodLabel = `${MONTHS[month - 1]} ${year}`
  const periodDates = `${formatDate(start.toISOString())} – ${formatDate(end.toISOString())}`
  const initials = getInitials(staffName)
  const gross = basicSalary + commissionEarned

  const advanceLines = advances.length === 0
    ? `<tr><td colspan="2" style="padding:8px 0;font-size:12px;color:#6b7280;">No active advances</td></tr>`
    : advances.map(a => {
        const amt = a.emi_amount ?? 0
        const totalMonths = a.emi_months ?? 0
        const remainingNow = a.emi_amount && a.amount_remaining
          ? Math.max(0, Math.ceil(a.amount_remaining / a.emi_amount))
          : 0
        const remainingAfter = Math.max(0, remainingNow - 1)
        const note = a.note ?? `Advance ${a.id.slice(0, 6)}`
        const tenor = a.repayment_mode === 'emi'
          ? `${totalMonths} mo total (${remainingAfter} remaining after this)`
          : 'Lump sum'
        return `<tr>
          <td style="padding:6px 0;font-size:12px;color:#111;">${escapeHtml(note)} <span style="color:#6b7280;">— ${tenor}</span></td>
          <td style="padding:6px 0;font-size:12px;color:#111;text-align:right;">AED ${formatMoney(amt)}</td>
        </tr>`
      }).join('')

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Salary slip — ${escapeHtml(staffName)} — ${periodLabel}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111; background: #fff; }
  .slip { max-width: 720px; margin: 0 auto; padding: 0; page-break-after: always; }
  .slip:last-child { page-break-after: auto; }
  .hdr { background: #034325; color: #fff; padding: 22px 28px; }
  .hdr .salon { font-size: 18px; font-weight: 600; margin: 0; }
  .hdr .period { font-size: 12px; opacity: 0.85; margin: 4px 0 0; }
  .body { padding: 24px 28px; }
  .who { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; }
  .avatar { width: 48px; height: 48px; border-radius: 50%; background: #f0fdf4; color: #034325; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 600; }
  .who .name { font-size: 16px; font-weight: 600; margin: 0; }
  .who .role { font-size: 12px; color: #6b7280; margin: 2px 0 0; text-transform: capitalize; }
  .who .dates { font-size: 11px; color: #6b7280; margin: 2px 0 0; }
  .section { margin-top: 18px; }
  .section-title { font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 6px 0; font-size: 12px; color: #111; border-bottom: 0.5px solid #f0f0f0; }
  td.r { text-align: right; }
  .subtotal td { font-weight: 600; border-bottom: none; padding-top: 10px; }
  .net { background: #f0fdf4; border: 0.5px solid #034325; border-radius: 6px; padding: 14px 18px; margin-top: 18px; display: flex; justify-content: space-between; align-items: center; }
  .net .lbl { font-size: 12px; color: #034325; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
  .net .amt { font-size: 20px; color: #034325; font-weight: 700; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
${opts.advances /* dummy ref kept to satisfy potential lints */ ? '' : ''}
<div class="slip">
  <div class="hdr">
    <p class="salon">${escapeHtml(salonName)}</p>
    <p class="period">Salary slip — ${periodLabel}</p>
  </div>
  <div class="body">
    <div class="who">
      <div class="avatar">${escapeHtml(initials)}</div>
      <div>
        <p class="name">${escapeHtml(staffName)}</p>
        <p class="role">${escapeHtml(staffRole)}</p>
        <p class="dates">Pay period: ${periodDates}</p>
      </div>
    </div>

    <div class="section">
      <p class="section-title">Earnings</p>
      <table>
        <tr><td>Basic salary</td><td class="r">AED ${formatMoney(basicSalary)}</td></tr>
        <tr><td>Commission</td><td class="r">AED ${formatMoney(commissionEarned)}</td></tr>
        <tr class="subtotal"><td>Gross</td><td class="r">AED ${formatMoney(gross)}</td></tr>
      </table>
    </div>

    <div class="section">
      <p class="section-title">Deductions</p>
      <table>
        ${advanceLines}
        <tr class="subtotal"><td>Total deductions</td><td class="r">AED ${formatMoney(advanceDeductions)}</td></tr>
      </table>
    </div>

    <div class="net">
      <span class="lbl">Net payable</span>
      <span class="amt">AED ${formatMoney(netPayable)}</span>
    </div>
  </div>
</div>
</body>
</html>`
}

function buildConsolidatedHTML(salonName: string, month: number, year: number, slips: string[]): string {
  // Merge multiple slip bodies into one document by extracting each <div class="slip"> block.
  const bodies = slips.map(html => {
    const match = html.match(/<div class="slip">[\s\S]*?<\/div>\s*<\/body>/)
    return match ? match[0].replace(/\s*<\/body>$/, '') : ''
  }).join('\n')

  const periodLabel = `${MONTHS[month - 1]} ${year}`

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Payroll report — ${escapeHtml(salonName)} — ${periodLabel}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111; background: #fff; }
  .slip { max-width: 720px; margin: 0 auto; padding: 0; page-break-after: always; }
  .slip:last-child { page-break-after: auto; }
  .hdr { background: #034325; color: #fff; padding: 22px 28px; }
  .hdr .salon { font-size: 18px; font-weight: 600; margin: 0; }
  .hdr .period { font-size: 12px; opacity: 0.85; margin: 4px 0 0; }
  .body { padding: 24px 28px; }
  .who { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; }
  .avatar { width: 48px; height: 48px; border-radius: 50%; background: #f0fdf4; color: #034325; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 600; }
  .who .name { font-size: 16px; font-weight: 600; margin: 0; }
  .who .role { font-size: 12px; color: #6b7280; margin: 2px 0 0; text-transform: capitalize; }
  .who .dates { font-size: 11px; color: #6b7280; margin: 2px 0 0; }
  .section { margin-top: 18px; }
  .section-title { font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 6px 0; font-size: 12px; color: #111; border-bottom: 0.5px solid #f0f0f0; }
  td.r { text-align: right; }
  .subtotal td { font-weight: 600; border-bottom: none; padding-top: 10px; }
  .net { background: #f0fdf4; border: 0.5px solid #034325; border-radius: 6px; padding: 14px 18px; margin-top: 18px; display: flex; justify-content: space-between; align-items: center; }
  .net .lbl { font-size: 12px; color: #034325; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
  .net .amt { font-size: 20px; color: #034325; font-weight: 700; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
${bodies}
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch] ?? ch))
}

function openPrintWindow(html: string, fallbackName: string) {
  const w = window.open('', '_blank', 'width=820,height=900')
  if (!w) {
    // Popups blocked — fall back to a downloadable HTML file.
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${fallbackName}.html`
    a.click()
    URL.revokeObjectURL(url)
    return
  }
  w.document.open()
  w.document.write(html)
  w.document.close()
  const trigger = () => { try { w.focus(); w.print() } catch { /* noop */ } }
  if (w.document.readyState === 'complete') setTimeout(trigger, 200)
  else w.addEventListener('load', () => setTimeout(trigger, 200))
}

// ── Styles ───────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff', border: '0.5px solid #e0e0e0',
  borderRadius: 8, padding: 16, marginBottom: 14,
}

const TH: React.CSSProperties = { textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', padding: '8px 10px', borderBottom: '0.5px solid #e0e0e0' }
const TD: React.CSSProperties = { fontSize: 12, color: '#111', padding: '8px 10px', borderBottom: '0.5px solid #f0f0f0', verticalAlign: 'middle' }

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Reports() {
  const staffRecord = useAuthStore(s => s.staffRecord)
  const salonNameStore = useAuthStore(s => s.salonName)
  const salonId = staffRecord?.salon_id ?? ''
  const [resolvedSalonName, setResolvedSalonName] = useState<string>(salonNameStore ?? '')

  const [cycles,         setCycles]         = useState<CycleSummary[]>([])
  const [selectedCycle,  setSelectedCycle]  = useState<SelectedCycle | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [detailLoading,  setDetailLoading]  = useState(false)
  const [generating,     setGenerating]     = useState(false)

  // ── Mount: fetch cycle summaries and salon name ─────────────────────────────
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!salonId) { setLoading(false); return }
      setLoading(true)

      const [{ data: runs }, { data: salonRow }] = await Promise.all([
        supabase
          .from('payroll_runs')
          .select('period_month, period_year, basic_salary, commission_earned, advance_deductions, net_payable, staff_id, created_at')
          .eq('salon_id', salonId),
        salonNameStore
          ? Promise.resolve({ data: { name: salonNameStore } })
          : supabase.from('salons').select('name').eq('id', salonId).single(),
      ])

      if (cancelled) return

      if (salonRow && (salonRow as { name?: string }).name) {
        setResolvedSalonName((salonRow as { name: string }).name)
      }

      const map = new Map<string, CycleSummary>()
      ;(runs ?? []).forEach(r => {
        const month = r.period_month as number
        const year  = r.period_year as number
        const key = `${year}-${month}`
        const basic = (r.basic_salary as number | null) ?? 0
        const comm  = (r.commission_earned as number | null) ?? 0
        const ded   = (r.advance_deductions as number | null) ?? 0
        const net   = (r.net_payable as number | null) ?? 0
        const ts    = (r.created_at as string) ?? ''

        const existing = map.get(key)
        if (existing) {
          existing.total_basic_salary       += basic
          existing.total_commission_earned  += comm
          existing.total_advance_deductions += ded
          existing.total_net_payable        += net
          existing.staff_count              += 1
          if (ts > existing.most_recent_created_at) existing.most_recent_created_at = ts
        } else {
          map.set(key, {
            period_month: month, period_year: year,
            total_basic_salary: basic, total_commission_earned: comm,
            total_advance_deductions: ded, total_net_payable: net,
            staff_count: 1, most_recent_created_at: ts,
          })
        }
      })

      const sorted = Array.from(map.values()).sort((a, b) =>
        b.period_year !== a.period_year ? b.period_year - a.period_year : b.period_month - a.period_month
      )
      setCycles(sorted)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [salonId, salonNameStore])

  // ── Open a cycle: fetch payroll_runs joined with staff ──────────────────────
  async function openCycle(c: CycleSummary) {
    if (!salonId) return
    setDetailLoading(true)
    const { data } = await supabase
      .from('payroll_runs')
      .select('id, staff_id, basic_salary, commission_earned, advance_deductions, net_payable, period_month, period_year, created_at, staff:staff_id(name, role)')
      .eq('salon_id', salonId)
      .eq('period_month', c.period_month)
      .eq('period_year',  c.period_year)
      .order('created_at', { ascending: true })

    const rows: CyclePayrollRow[] = (data ?? []).map(r => {
      const joined = (r as unknown as { staff: { name?: string; role?: string } | null }).staff
      return {
        id:                 r.id as string,
        staff_id:           r.staff_id as string,
        staff_name:         joined?.name ?? '—',
        staff_role:         joined?.role ?? '',
        basic_salary:       (r.basic_salary as number | null) ?? 0,
        commission_earned:  (r.commission_earned as number | null) ?? 0,
        advance_deductions: (r.advance_deductions as number | null) ?? 0,
        net_payable:        (r.net_payable as number | null) ?? 0,
        period_month:       r.period_month as number,
        period_year:        r.period_year as number,
        created_at:         (r.created_at as string) ?? '',
      }
    })

    setSelectedCycle({ period_month: c.period_month, period_year: c.period_year, rows })
    setDetailLoading(false)
  }

  // ── PDF: per-staff slip ─────────────────────────────────────────────────────
  async function downloadSlip(row: CyclePayrollRow) {
    if (!selectedCycle) return
    setGenerating(true)
    const { data: advData } = await supabase
      .from('staff_advances')
      .select('*')
      .eq('staff_id', row.staff_id)
      .eq('status', 'active')
    const advances = (advData ?? []) as AdvanceRow[]
    const html = buildSlipHTML({
      salonName:          resolvedSalonName || 'Salon',
      staffName:          row.staff_name,
      staffRole:          row.staff_role,
      month:              selectedCycle.period_month,
      year:               selectedCycle.period_year,
      basicSalary:        row.basic_salary,
      commissionEarned:   row.commission_earned,
      advanceDeductions:  row.advance_deductions,
      netPayable:         row.net_payable,
      advances,
    })
    openPrintWindow(html, `salary-slip-${row.staff_name}-${MONTHS[selectedCycle.period_month - 1]}-${selectedCycle.period_year}`)
    setGenerating(false)
  }

  // ── PDF: consolidated for entire cycle ──────────────────────────────────────
  async function downloadConsolidated() {
    if (!selectedCycle) return
    setGenerating(true)
    const slipHtmls: string[] = []
    for (const row of selectedCycle.rows) {
      const { data: advData } = await supabase
        .from('staff_advances')
        .select('*')
        .eq('staff_id', row.staff_id)
        .eq('status', 'active')
      slipHtmls.push(buildSlipHTML({
        salonName:          resolvedSalonName || 'Salon',
        staffName:          row.staff_name,
        staffRole:          row.staff_role,
        month:              selectedCycle.period_month,
        year:               selectedCycle.period_year,
        basicSalary:        row.basic_salary,
        commissionEarned:   row.commission_earned,
        advanceDeductions:  row.advance_deductions,
        netPayable:         row.net_payable,
        advances:           (advData ?? []) as AdvanceRow[],
      }))
    }
    const html = buildConsolidatedHTML(
      resolvedSalonName || 'Salon',
      selectedCycle.period_month,
      selectedCycle.period_year,
      slipHtmls,
    )
    openPrintWindow(html, `payroll-${MONTHS[selectedCycle.period_month - 1]}-${selectedCycle.period_year}`)
    setGenerating(false)
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  const cycleTotals = selectedCycle
    ? selectedCycle.rows.reduce((acc, r) => ({
        basic:      acc.basic      + r.basic_salary,
        commission: acc.commission + r.commission_earned,
        deductions: acc.deductions + r.advance_deductions,
        net:        acc.net        + r.net_payable,
      }), { basic: 0, commission: 0, deductions: 0, net: 0 })
    : null

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', display: 'flex', flexDirection: 'column' }}>
      <Topbar />

      <div style={{ marginTop: 52, flex: 1, padding: '20px 28px 32px' }}>
        <p style={{ fontSize: 16, fontWeight: 500, color: '#111', margin: '0 0 16px' }}>Reports</p>

        {/* Section 1 — Payroll history */}
        <div style={cardStyle}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#034325', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 12px' }}>Payroll history</p>
          {loading ? (
            <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>Loading…</p>
          ) : cycles.length === 0 ? (
            <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>No payroll cycles yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {cycles.map(c => {
                const isSelected = !!selectedCycle && selectedCycle.period_month === c.period_month && selectedCycle.period_year === c.period_year
                return (
                  <div
                    key={`${c.period_year}-${c.period_month}`}
                    onClick={() => openCycle(c)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '12px 8px', cursor: 'pointer',
                      borderBottom: '0.5px solid #f0f0f0',
                      backgroundColor: isSelected ? '#f0fdf4' : 'transparent',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 13, color: '#111', fontWeight: 500 }}>{MONTHS[c.period_month - 1]} {c.period_year}</span>
                      <span style={{ fontSize: 11, color: '#6b7280' }}>
                        Run {c.most_recent_created_at ? formatDate(c.most_recent_created_at) : '—'} · {c.staff_count} staff
                      </span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#034325' }}>AED {formatMoney(c.total_net_payable)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Section 2 — Selected cycle detail */}
        {selectedCycle && cycleTotals && (() => {
          const { start, end } = periodBounds(selectedCycle.period_month, selectedCycle.period_year)
          return (
            <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
              <div style={{ backgroundColor: '#034325', color: '#ffffff', padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
                    Payroll report — {MONTHS[selectedCycle.period_month - 1]} {selectedCycle.period_year}
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: 11, opacity: 0.85 }}>
                    {formatDate(start.toISOString())} – {formatDate(end.toISOString())}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedCycle(null)}
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.15)', color: '#ffffff',
                    border: '0.5px solid rgba(255,255,255,0.3)', borderRadius: 6,
                    padding: '5px 12px', fontSize: 12, cursor: 'pointer',
                  }}
                >← Back</button>
              </div>

              <div style={{ padding: '18px 22px' }}>
                {detailLoading ? (
                  <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>Loading…</p>
                ) : (
                  <>
                    {/* Summary metrics */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 18 }}>
                      <MetricCard label="Total salary" value={cycleTotals.basic} />
                      <MetricCard label="Total commission" value={cycleTotals.commission} />
                      <MetricCard label="Total deductions" value={cycleTotals.deductions} valueColor="#991b1b" />
                      <MetricCard label="Net payable" value={cycleTotals.net} valueColor="#034325" backgroundColor="#f0fdf4" />
                    </div>

                    {/* Salary slips table */}
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#034325', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '6px 0 10px' }}>Salary slips</p>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th style={TH}>Staff</th>
                            <th style={{ ...TH, textAlign: 'right' }}>Basic salary</th>
                            <th style={{ ...TH, textAlign: 'right' }}>Commission</th>
                            <th style={{ ...TH, textAlign: 'right' }}>Deductions</th>
                            <th style={{ ...TH, textAlign: 'right' }}>Net payable</th>
                            <th style={{ ...TH, textAlign: 'right', width: 110 }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedCycle.rows.map(r => (
                            <tr key={r.id}>
                              <td style={TD}>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ fontSize: 13, color: '#111' }}>{r.staff_name}</span>
                                  <span style={{ fontSize: 11, color: '#6b7280', textTransform: 'capitalize' }}>{r.staff_role}</span>
                                </div>
                              </td>
                              <td style={{ ...TD, textAlign: 'right' }}>AED {formatMoney(r.basic_salary)}</td>
                              <td style={{ ...TD, textAlign: 'right' }}>AED {formatMoney(r.commission_earned)}</td>
                              <td style={{ ...TD, textAlign: 'right', color: '#991b1b' }}>AED {formatMoney(r.advance_deductions)}</td>
                              <td style={{ ...TD, textAlign: 'right', fontWeight: 600, color: '#034325' }}>AED {formatMoney(r.net_payable)}</td>
                              <td style={{ ...TD, textAlign: 'right' }}>
                                <button
                                  onClick={() => downloadSlip(r)}
                                  disabled={generating}
                                  style={{
                                    backgroundColor: 'transparent', color: '#034325',
                                    border: '0.5px solid #034325', borderRadius: 4,
                                    padding: '4px 10px', fontSize: 11,
                                    cursor: generating ? 'not-allowed' : 'pointer',
                                  }}
                                >Download</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        onClick={downloadConsolidated}
                        disabled={generating || selectedCycle.rows.length === 0}
                        style={{
                          backgroundColor: (generating || selectedCycle.rows.length === 0) ? '#e0e0e0' : '#034325',
                          color: (generating || selectedCycle.rows.length === 0) ? '#9ca3af' : '#ffffff',
                          border: 'none', borderRadius: 6, padding: '9px 16px',
                          fontSize: 12, fontWeight: 600,
                          cursor: (generating || selectedCycle.rows.length === 0) ? 'not-allowed' : 'pointer',
                        }}
                      >Download consolidated report</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )
        })()}
      </div>

      <div style={{ textAlign: 'center', padding: '10px 0 14px' }}>
        <p style={{ color: '#9ca3af', fontSize: 10, margin: 0 }}>Powered by Blue Flute Consulting LLC-FZ</p>
      </div>
    </div>
  )
}

// ── Helper component: metric card ────────────────────────────────────────────

function MetricCard({ label, value, valueColor, backgroundColor }: {
  label: string
  value: number
  valueColor?: string
  backgroundColor?: string
}) {
  return (
    <div style={{
      backgroundColor: backgroundColor ?? '#f9fafb',
      border: '0.5px solid #e0e0e0', borderRadius: 6, padding: '12px 14px',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 600, color: valueColor ?? '#111' }}>AED {formatMoney(value)}</span>
    </div>
  )
}
