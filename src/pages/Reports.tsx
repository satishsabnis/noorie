import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import Topbar from '../components/Topbar'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useSalonTimezone, salonNowUTC, salonOffsetStr } from '../hooks/useSalonTimezone'

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

function buildConsolidatedHTML(opts: {
  salonName: string
  month: number
  year: number
  rows: {
    staff_name: string
    staff_role: string
    basic_salary: number
    commission_earned: number
    advance_deductions: number
    net_payable: number
  }[]
  runDate: string
}): string {
  const { salonName, month, year, rows, runDate } = opts
  const { start, end } = periodBounds(month, year)
  const periodLabel = `${MONTHS[month - 1]} ${year}`
  const periodDates = `${formatDate(start.toISOString())} – ${formatDate(end.toISOString())}`

  const totals = rows.reduce((acc, r) => ({
    basic:      acc.basic      + r.basic_salary,
    commission: acc.commission + r.commission_earned,
    deductions: acc.deductions + r.advance_deductions,
    net:        acc.net        + r.net_payable,
  }), { basic: 0, commission: 0, deductions: 0, net: 0 })

  const tableRows = rows.map(r => `<tr>
    <td>${escapeHtml(r.staff_name)}</td>
    <td class="role">${escapeHtml(r.staff_role)}</td>
    <td class="r">AED ${formatMoney(r.basic_salary)}</td>
    <td class="r">AED ${formatMoney(r.commission_earned)}</td>
    <td class="r ded">AED ${formatMoney(r.advance_deductions)}</td>
    <td class="r net-cell">AED ${formatMoney(r.net_payable)}</td>
  </tr>`).join('')

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Payroll report — ${escapeHtml(salonName)} — ${periodLabel}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111; background: #fff; }
  .doc { max-width: 820px; margin: 0 auto; }
  .hdr { background: #034325; color: #fff; padding: 22px 28px; }
  .hdr .salon { font-size: 18px; font-weight: 600; margin: 0; }
  .hdr .title { font-size: 13px; opacity: 0.95; margin: 6px 0 0; }
  .hdr .dates { font-size: 11px; opacity: 0.8; margin: 4px 0 0; }
  .body { padding: 24px 28px; }
  .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 22px; }
  .metric { border: 0.5px solid #e0e0e0; border-radius: 6px; padding: 12px 14px; }
  .metric .lbl { font-size: 10px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; display: block; }
  .metric .val { font-size: 15px; font-weight: 600; color: #111; margin-top: 4px; display: block; }
  .metric.ded .val { color: #991b1b; }
  .metric.net { background: #f0fdf4; border-color: #034325; }
  .metric.net .val { color: #034325; }
  table.staff { width: 100%; border-collapse: collapse; }
  table.staff th { text-align: left; font-size: 11px; font-weight: 600; color: #6b7280; padding: 8px 10px; border-bottom: 0.5px solid #e0e0e0; text-transform: uppercase; letter-spacing: 0.04em; }
  table.staff th.r { text-align: right; }
  table.staff td { font-size: 12px; color: #111; padding: 8px 10px; border-bottom: 0.5px solid #f0f0f0; vertical-align: middle; }
  table.staff td.r { text-align: right; }
  table.staff td.role { color: #6b7280; text-transform: capitalize; }
  table.staff td.ded { color: #991b1b; }
  table.staff td.net-cell { color: #034325; font-weight: 600; }
  .footer { margin-top: 28px; padding-top: 14px; border-top: 0.5px solid #e0e0e0; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #6b7280; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="doc">
  <div class="hdr">
    <p class="salon">${escapeHtml(salonName)}</p>
    <p class="title">Payroll report — ${periodLabel}</p>
    <p class="dates">${periodDates}</p>
  </div>
  <div class="body">
    <div class="summary">
      <div class="metric"><span class="lbl">Total salary</span><span class="val">AED ${formatMoney(totals.basic)}</span></div>
      <div class="metric"><span class="lbl">Total commission</span><span class="val">AED ${formatMoney(totals.commission)}</span></div>
      <div class="metric ded"><span class="lbl">Total deductions</span><span class="val">AED ${formatMoney(totals.deductions)}</span></div>
      <div class="metric net"><span class="lbl">Total net payable</span><span class="val">AED ${formatMoney(totals.net)}</span></div>
    </div>

    <table class="staff">
      <thead>
        <tr>
          <th>Staff</th>
          <th>Role</th>
          <th class="r">Basic salary</th>
          <th class="r">Commission</th>
          <th class="r">Deductions</th>
          <th class="r">Net payable</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>

    <div class="footer">
      <span>Powered by Noorie</span>
      <span>Run date: ${escapeHtml(runDate)}</span>
    </div>
  </div>
</div>
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

// ── Finance PDF builder ───────────────────────────────────────────────────────

function buildFinancePDF(opts: {
  salonName: string
  month: number
  year: number
  income: { cash: number; card: number; other: number; productSales: number; total: number }
  expenses: {
    fixed:    { items: { id: string; name: string; amount: number }[]; total: number }
    variable: { items: { id: string; name: string; amount: number }[]; total: number }
    one_time: { items: { id: string; name: string; amount: number }[]; total: number }
    marketing: { items: { id: string; name: string; amount: number }[]; total: number }
    grandTotal: number
  }
  tips: { perStaff: { staffId: string; name: string; amount: number }[]; cardTotal: number }
}): string {
  const { salonName, month, year, income, expenses, tips } = opts
  const net = (income.total + expenses.marketing.total) - expenses.grandTotal
  const periodLabel = `${MONTHS[month - 1]} ${year}`

  function expBlock(items: { id: string; name: string; amount: number }[]): string {
    if (items.length === 0) return `<tr><td colspan="2" style="padding:6px 0;font-size:12px;color:#6b7280;">No expenses recorded yet</td></tr>`
    return items.map(e => `<tr><td style="padding:6px 0;font-size:12px;">${escapeHtml(e.name)}</td><td style="padding:6px 0;font-size:12px;text-align:right;">AED ${formatMoney(e.amount)}</td></tr>`).join('')
  }

  function tipsBlock(t: { perStaff: { staffId: string; name: string; amount: number }[]; cardTotal: number }): string {
    if (t.perStaff.length === 0) return `<tr><td colspan="2" style="padding:6px 0;font-size:12px;color:#6b7280;">No tips recorded yet</td></tr>`
    const rows = t.perStaff.map(s => `<tr><td style="padding:6px 0;font-size:12px;">Tips earned, ${escapeHtml(s.name)}</td><td style="padding:6px 0;font-size:12px;text-align:right;">AED ${formatMoney(s.amount)}</td></tr>`).join('')
    const note = `<tr><td colspan="2" style="padding:6px 0;font-size:11px;color:#6b7280;border-bottom:none;">AED ${formatMoney(t.cardTotal)} in card tips paid out to staff in cash. Not salon income, not commission.</td></tr>`
    return rows + note
  }

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Finance Report — ${escapeHtml(salonName)} — ${periodLabel}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111; background: #fff; }
  .doc { max-width: 720px; margin: 0 auto; }
  .hdr { background: #034325; color: #fff; padding: 22px 28px; }
  .hdr .salon { font-size: 18px; font-weight: 600; margin: 0; }
  .hdr .title { font-size: 13px; opacity: 0.85; margin: 6px 0 0; }
  .body { padding: 24px 28px; }
  .st { font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; margin: 16px 0 6px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 6px 0; font-size: 12px; border-bottom: 0.5px solid #f0f0f0; }
  .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 20px; padding-top: 14px; border-top: 0.5px solid #e0e0e0; }
  .metric { border: 0.5px solid #e0e0e0; border-radius: 6px; padding: 12px 14px; }
  .metric .lbl { font-size: 10px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; display: block; }
  .metric .val { font-size: 16px; font-weight: 600; margin-top: 4px; display: block; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="doc">
  <div class="hdr">
    <p class="salon">${escapeHtml(salonName)}</p>
    <p class="title">Finance Report — ${periodLabel}</p>
  </div>
  <div class="body">
    <p class="st">Income</p>
    <table>
      <tr><td>Cash</td><td style="text-align:right;">AED ${formatMoney(income.cash)}</td></tr>
      <tr><td>Card</td><td style="text-align:right;">AED ${formatMoney(income.card)}</td></tr>
      <tr><td>Other</td><td style="text-align:right;">AED ${formatMoney(income.other)}</td></tr>
      <tr><td>Product Sales</td><td style="text-align:right;">AED ${formatMoney(income.productSales)}</td></tr>
      <tr><td>Cash received</td><td style="text-align:right;">AED ${formatMoney(income.total)}</td></tr>
      <tr><td style="font-weight:600;color:#034325;border-bottom:none;">Sales (full value)</td><td style="text-align:right;font-weight:600;color:#034325;border-bottom:none;">AED ${formatMoney(income.total + expenses.marketing.total)}</td></tr>
    </table>
    <p class="st">Fixed Expenses</p>
    <table><tbody>${expBlock(expenses.fixed.items)}</tbody></table>
    <p class="st">Variable Expenses</p>
    <table><tbody>${expBlock(expenses.variable.items)}</tbody></table>
    <p class="st">One-Time Expenses</p>
    <table><tbody>${expBlock(expenses.one_time.items)}</tbody></table>
    <p class="st">Marketing Expenses</p>
    <table><tbody>${expBlock(expenses.marketing.items)}</tbody></table>
    <p class="st">Tips</p>
    <table><tbody>${tipsBlock(tips)}</tbody></table>
    <div class="summary">
      <div class="metric" style="background:#f0fdf4;border-color:#034325;"><span class="lbl">Sales (full value)</span><span class="val" style="color:#034325;">AED ${formatMoney(income.total + expenses.marketing.total)}</span></div>
      <div class="metric"><span class="lbl">Total expenses</span><span class="val" style="color:#991b1b;">AED ${formatMoney(expenses.grandTotal)}</span></div>
      <div class="metric"><span class="lbl">Net — ${periodLabel}</span><span class="val" style="color:${net > 0 ? '#034325' : net < 0 ? '#991b1b' : '#111'};">AED ${formatMoney(net)}</span></div>
    </div>
  </div>
</div>
</body>
</html>`
}

// ── YTD PDF builder ───────────────────────────────────────────────────────────

function buildYTDPDF(opts: {
  salonName: string
  fyStartMonth: number
  selectedMonth: number
  selectedYear: number
  ytdData: {
    months: { month: number; year: number; income: number; expenses: { name: string; category: string; amount: number }[] }[]
    totalIncome: number
    totalExpenses: number
    net: number
  }
}): string {
  const { salonName, fyStartMonth, selectedMonth, selectedYear, ytdData } = opts
  const startYear = selectedMonth >= fyStartMonth ? selectedYear : selectedYear - 1
  const title = `YTD Balance Sheet — ${MONTHS[fyStartMonth - 1]} ${startYear} – ${MONTHS[selectedMonth - 1]} ${selectedYear}`

  const monthRows = ytdData.months.map(m => {
    const expTotal = m.expenses.reduce((s, e) => s + e.amount, 0)
    const expLines = m.expenses.length === 0
      ? `<tr><td colspan="3" style="font-size:11px;color:#6b7280;padding:4px 0;">No expenses recorded</td></tr>`
      : m.expenses.map(e => `<tr>
          <td style="font-size:11px;padding:4px 0 4px 10px;">${escapeHtml(e.name)}</td>
          <td style="font-size:11px;padding:4px 0;color:#6b7280;text-transform:capitalize;">${e.category.replace('_', '-')}</td>
          <td style="font-size:11px;padding:4px 0;text-align:right;">AED ${formatMoney(e.amount)}</td>
        </tr>`).join('')
    const monthNet = m.income - expTotal
    return `
      <tr style="background:#f9fafb;">
        <td colspan="3" style="font-size:13px;font-weight:600;padding:12px 0 6px;">${MONTHS[m.month - 1]} ${m.year}</td>
      </tr>
      <tr><td colspan="3" style="font-size:10px;font-weight:600;color:#6b7280;padding:4px 0;text-transform:uppercase;letter-spacing:0.04em;">Income</td></tr>
      <tr><td style="font-size:11px;padding:4px 0;" colspan="2">Total payments</td><td style="font-size:11px;padding:4px 0;text-align:right;">AED ${formatMoney(m.income)}</td></tr>
      <tr><td colspan="3" style="font-size:10px;font-weight:600;color:#6b7280;padding:8px 0 4px;text-transform:uppercase;letter-spacing:0.04em;">Expenses</td></tr>
      ${expLines}
      <tr style="border-top:0.5px solid #e0e0e0;">
        <td style="font-size:11px;font-weight:600;padding:6px 0;" colspan="2">Net this month</td>
        <td style="font-size:11px;font-weight:600;padding:6px 0;text-align:right;color:${monthNet >= 0 ? '#034325' : '#991b1b'};">AED ${formatMoney(monthNet)}</td>
      </tr>`
  }).join('')

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111; background: #fff; }
  .doc { max-width: 720px; margin: 0 auto; }
  .hdr { background: #034325; color: #fff; padding: 22px 28px; }
  .hdr .salon { font-size: 18px; font-weight: 600; margin: 0; }
  .hdr .title { font-size: 13px; opacity: 0.85; margin: 6px 0 0; }
  .body { padding: 24px 28px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 6px 0; }
  .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 20px; padding-top: 14px; border-top: 0.5px solid #e0e0e0; }
  .metric { border: 0.5px solid #e0e0e0; border-radius: 6px; padding: 12px 14px; }
  .metric .lbl { font-size: 10px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; display: block; }
  .metric .val { font-size: 16px; font-weight: 600; margin-top: 4px; display: block; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="doc">
  <div class="hdr">
    <p class="salon">${escapeHtml(salonName)}</p>
    <p class="title">${escapeHtml(title)}</p>
  </div>
  <div class="body">
    <table><tbody>${monthRows}</tbody></table>
    <div class="summary">
      <div class="metric" style="background:#f0fdf4;border-color:#034325;"><span class="lbl">Total income YTD</span><span class="val" style="color:#034325;">AED ${formatMoney(ytdData.totalIncome)}</span></div>
      <div class="metric"><span class="lbl">Total expenses YTD</span><span class="val" style="color:#991b1b;">AED ${formatMoney(ytdData.totalExpenses)}</span></div>
      <div class="metric"><span class="lbl">Net YTD</span><span class="val" style="color:${ytdData.net > 0 ? '#034325' : ytdData.net < 0 ? '#991b1b' : '#111'};">AED ${formatMoney(ytdData.net)}</span></div>
    </div>
  </div>
</div>
</body>
</html>`
}

interface ProductSaleRow {
  id: string
  date: string
  clientName: string
  staffName: string
  productName: string
  qty: number
  priceSold: number
  marginRetained: number
  commissionPct: number
  commission: number
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Reports() {
  const staffRecord    = useAuthStore(s => s.staffRecord)
  const salonNameStore = useAuthStore(s => s.salonName)
  const salonId = staffRecord?.salon_id ?? ''
  const role    = staffRecord?.role ?? ''
  const { tz } = useSalonTimezone()
  const [resolvedSalonName, setResolvedSalonName] = useState<string>(salonNameStore ?? '')

  // ── Navigation ──────────────────────────────────────────────────────────
  const location = useLocation()
  const hasMounted = useRef(false)
  const [view,          setView]          = useState<'landing' | 'finance' | 'payroll' | 'ytd' | 'toprunner' | 'topclients' | 'inv-landing' | 'inv-product-sales' | 'inv-supplies'>('landing')
  const [showModal,     setShowModal]     = useState<'finance' | 'payroll' | null>(null)
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1)
  const [selectedYear,  setSelectedYear]  = useState<number>(new Date().getFullYear())
  const [topRunnerTab,  setTopRunnerTab]  = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly')
  const [topRunnerData, setTopRunnerData] = useState<{ name: string; revenue: number; appointments: number }[]>([])
  const [topRunnerLoading, setTopRunnerLoading] = useState(false)
  const [topClientsTab,  setTopClientsTab]  = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly')
  const [topClientsData, setTopClientsData] = useState<{ name: string; visits: number; spend: number; last_visit: string }[]>([])
  const [topClientsLoading, setTopClientsLoading] = useState(false)
  const [invMonth,       setInvMonth]       = useState<number>(new Date().getMonth() + 1)
  const [invYear,        setInvYear]        = useState<number>(new Date().getFullYear())
  const [invData,        setInvData]        = useState<{ itemId: string; name: string; openingStock: number; newStock: number; closingCount: number | null; consumed: number | null }[]>([])
  const [invLoading,     setInvLoading]     = useState(false)
  const [psSalesMonth,   setPsSalesMonth]   = useState<number>(new Date().getMonth() + 1)
  const [psSalesYear,    setPsSalesYear]    = useState<number>(new Date().getFullYear())
  const [psSalesData,    setPsSalesData]    = useState<ProductSaleRow[]>([])
  const [psSalesLoading, setPsSalesLoading] = useState(false)

  // Reset to landing when the Reports nav link is tapped while already on /reports
  useEffect(() => {
    if (!hasMounted.current) { hasMounted.current = true; return }
    setView('landing')
  }, [location])

  // Refetch top-runner data whenever the view becomes 'toprunner' or the tab changes
  useEffect(() => {
    if (view === 'toprunner') fetchTopRunner(topRunnerTab)
  }, [view, topRunnerTab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch top-clients data whenever the view becomes 'topclients' or the tab changes
  useEffect(() => {
    if (view === 'topclients') fetchTopClients(topClientsTab)
  }, [view, topClientsTab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch inventory consumption whenever the view becomes 'inv-supplies' or month/year changes
  useEffect(() => {
    if (view === 'inv-supplies') fetchInventoryConsumption(invMonth, invYear)
  }, [view, invMonth, invYear]) // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch product sales whenever the view becomes 'inv-product-sales' or month/year changes
  useEffect(() => {
    if (view === 'inv-product-sales') fetchProductSales(psSalesMonth, psSalesYear)
  }, [view, psSalesMonth, psSalesYear]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Config ──────────────────────────────────────────────────────────────
  const [fyStartMonth,            setFyStartMonth]            = useState<number | null>(null)
  const [supervisorViewFinancials, setSupervisorViewFinancials] = useState(false)

  // ── Finance ─────────────────────────────────────────────────────────────
  const [financeIncome,        setFinanceIncome]        = useState({ cash: 0, card: 0, other: 0, total: 0 })
  const [financeProductSales,  setFinanceProductSales]  = useState(0)
  const [financeExpenses, setFinanceExpenses] = useState({
    fixed:    { items: [] as { id: string; name: string; amount: number }[], total: 0 },
    variable: { items: [] as { id: string; name: string; amount: number }[], total: 0 },
    one_time: { items: [] as { id: string; name: string; amount: number }[], total: 0 },
    marketing: { items: [] as { id: string; name: string; amount: number }[], total: 0 },
    grandTotal: 0,
  })
  const [financeLoading, setFinanceLoading] = useState(false)
  const [financeTips, setFinanceTips] = useState<{ perStaff: { staffId: string; name: string; amount: number }[]; cardTotal: number }>({ perStaff: [], cardTotal: 0 })

  // ── YTD ─────────────────────────────────────────────────────────────────
  const [ytdData, setYtdData] = useState<{
    months: { month: number; year: number; income: number; expenses: { name: string; category: string; amount: number }[] }[]
    totalIncome: number; totalExpenses: number; net: number
  }>({ months: [], totalIncome: 0, totalExpenses: 0, net: 0 })
  const [ytdLoading, setYtdLoading] = useState(false)

  // ── Payroll ─────────────────────────────────────────────────────────────
  const [cycles,        setCycles]        = useState<CycleSummary[]>([])
  const [selectedCycle, setSelectedCycle] = useState<SelectedCycle | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [generating,    setGenerating]    = useState(false)

  const canViewFinance = role === 'owner' || (role === 'supervisor' && supervisorViewFinancials)
  const canViewTopRunner = role === 'owner'

  // ── Mount: payroll cycles + salon name + config ─────────────────────────
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!salonId) { setLoading(false); return }
      setLoading(true)

      const [{ data: runs }, salonResult, { data: configRow }] = await Promise.all([
        supabase
          .from('payroll_runs')
          .select('period_month, period_year, basic_salary, commission_earned, advance_deductions, net_payable, staff_id, created_at')
          .eq('salon_id', salonId),
        salonNameStore
          ? Promise.resolve({ data: { name: salonNameStore } })
          : supabase.from('salons').select('name').eq('id', salonId).single(),
        supabase.from('salon_config').select('fy_start_month, supervisor_view_financials').eq('salon_id', salonId).single(),
      ])

      if (cancelled) return

      const sd = salonResult.data as { name?: string } | null
      if (sd?.name) setResolvedSalonName(sd.name)

      if (configRow) {
        const c = configRow as { fy_start_month?: number | null; supervisor_view_financials?: boolean }
        setFyStartMonth(c.fy_start_month ?? null)
        setSupervisorViewFinancials(c.supervisor_view_financials ?? false)
      }

      const map = new Map<string, CycleSummary>()
      ;(runs ?? []).forEach(r => {
        const month = r.period_month as number
        const year  = r.period_year  as number
        const key   = `${year}-${month}`
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

  // ── Top Runner fetch ────────────────────────────────────────────────────
  async function fetchTopRunner(tab: 'daily' | 'weekly' | 'monthly' | 'yearly') {
    if (!salonId) return
    setTopRunnerLoading(true)

    const dubaiNow = salonNowUTC(tz)
    const ty = dubaiNow.getUTCFullYear()
    const tm = dubaiNow.getUTCMonth()
    const td = dubaiNow.getUTCDate()
    const offset = salonOffsetStr(tz)

    let rangeStart = ''
    let rangeEnd = ''
    if (tab === 'daily') {
      const ymd = dubaiNow.toISOString().slice(0, 10)
      rangeStart = `${ymd}T00:00:00${offset}`
      rangeEnd   = `${ymd}T23:59:59${offset}`
    } else if (tab === 'weekly') {
      const dayIdx = (dubaiNow.getUTCDay() + 6) % 7   // 0=Mon..6=Sun
      const mondayMs = Date.UTC(ty, tm, td) - dayIdx * 86_400_000
      const sundayMs = mondayMs + 6 * 86_400_000
      const monStr = new Date(mondayMs).toISOString().slice(0, 10)
      const sunStr = new Date(sundayMs).toISOString().slice(0, 10)
      rangeStart = `${monStr}T00:00:00${offset}`
      rangeEnd   = `${sunStr}T23:59:59${offset}`
    } else if (tab === 'monthly') {
      const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate()
      const mm = String(tm + 1).padStart(2, '0')
      rangeStart = `${ty}-${mm}-01T00:00:00${offset}`
      rangeEnd   = `${ty}-${mm}-${String(lastDay).padStart(2, '0')}T23:59:59${offset}`
    } else {
      rangeStart = `${ty}-01-01T00:00:00${offset}`
      rangeEnd   = `${ty}-12-31T23:59:59${offset}`
    }

    const { data } = await supabase
      .from('appointment_services')
      .select('appointment_id, price, staff!inner(name), appointments!inner(status, salon_id, starts_at)')
      .eq('appointments.salon_id', salonId)
      .eq('appointments.status', 'completed')
      .gte('appointments.starts_at', rangeStart)
      .lte('appointments.starts_at', rangeEnd)

    const map: Record<string, { revenue: number; apptIds: Set<string> }> = {}
    for (const row of data ?? []) {
      const name = (row.staff as unknown as { name: string } | null)?.name || 'Unassigned'
      const price = (row.price as number | null) ?? 0
      const aid = row.appointment_id as string
      if (!map[name]) map[name] = { revenue: 0, apptIds: new Set() }
      map[name].revenue += price
      map[name].apptIds.add(aid)
    }

    const result = Object.entries(map)
      .map(([name, v]) => ({ name, revenue: Math.round(v.revenue * 100) / 100, appointments: v.apptIds.size }))
      .sort((a, b) => b.revenue - a.revenue)

    setTopRunnerData(result)
    setTopRunnerLoading(false)
  }

  // ── Top Clients fetch ───────────────────────────────────────────────────
  async function fetchTopClients(tab: 'daily' | 'weekly' | 'monthly' | 'yearly') {
    if (!salonId) return
    setTopClientsLoading(true)

    const dubaiNow = salonNowUTC(tz)
    const ty = dubaiNow.getUTCFullYear()
    const tm = dubaiNow.getUTCMonth()
    const td = dubaiNow.getUTCDate()
    const offset = salonOffsetStr(tz)

    let rangeStart = ''
    let rangeEnd = ''
    if (tab === 'daily') {
      const ymd = dubaiNow.toISOString().slice(0, 10)
      rangeStart = `${ymd}T00:00:00${offset}`
      rangeEnd   = `${ymd}T23:59:59${offset}`
    } else if (tab === 'weekly') {
      const dayIdx = (dubaiNow.getUTCDay() + 6) % 7
      const mondayMs = Date.UTC(ty, tm, td) - dayIdx * 86_400_000
      const sundayMs = mondayMs + 6 * 86_400_000
      const monStr = new Date(mondayMs).toISOString().slice(0, 10)
      const sunStr = new Date(sundayMs).toISOString().slice(0, 10)
      rangeStart = `${monStr}T00:00:00${offset}`
      rangeEnd   = `${sunStr}T23:59:59${offset}`
    } else if (tab === 'monthly') {
      const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate()
      const mm = String(tm + 1).padStart(2, '0')
      rangeStart = `${ty}-${mm}-01T00:00:00${offset}`
      rangeEnd   = `${ty}-${mm}-${String(lastDay).padStart(2, '0')}T23:59:59${offset}`
    } else {
      rangeStart = `${ty}-01-01T00:00:00${offset}`
      rangeEnd   = `${ty}-12-31T23:59:59${offset}`
    }

    const { data } = await supabase
      .from('appointments')
      .select('id, client_id, starts_at, clients!inner(name), payments(amount, status)')
      .eq('salon_id', salonId)
      .eq('status', 'completed')
      .gte('starts_at', rangeStart)
      .lte('starts_at', rangeEnd)

    const map: Record<string, { visits: Set<string>; spend: number; lastStartsAt: string }> = {}
    for (const row of data ?? []) {
      const name = (row.clients as unknown as { name: string } | null)?.name || 'Unknown'
      const aid = row.id as string
      const startsAt = (row.starts_at as string | null) ?? ''
      if (!map[name]) map[name] = { visits: new Set(), spend: 0, lastStartsAt: '' }
      map[name].visits.add(aid)
      if (startsAt > map[name].lastStartsAt) map[name].lastStartsAt = startsAt
      const pays = (row.payments as unknown as { amount: number | null; status: string | null }[] | null) ?? []
      for (const p of pays) {
        if (p.status !== 'completed') continue
        map[name].spend += (p.amount as number | null) ?? 0
      }
    }

    const result = Object.entries(map)
      .map(([name, v]) => ({
        name,
        visits: v.visits.size,
        spend: Math.round(v.spend * 100) / 100,
        last_visit: v.lastStartsAt ? formatDate(v.lastStartsAt) : '—',
      }))
      .sort((a, b) => b.spend - a.spend)

    setTopClientsData(result)
    setTopClientsLoading(false)
  }

  // ── Inventory Consumption fetch ─────────────────────────────────────────
  async function fetchInventoryConsumption(month: number, year: number) {
    if (!salonId) return
    setInvLoading(true)
    const monthStart = new Date(year, month - 1, 1).toISOString()
    const monthEnd   = new Date(year, month, 1).toISOString()

    const { data: items } = await supabase
      .from('inventory_items')
      .select('id, name')
      .eq('salon_id', salonId)
      .eq('type', 'supply')
      .order('name')

    if (!items || items.length === 0) { setInvData([]); setInvLoading(false); return }

    const itemIds = (items as { id: string; name: string }[]).map(i => i.id)

    const { data: txns } = await supabase
      .from('inventory_transactions')
      .select('item_id, type, quantity, created_at')
      .eq('salon_id', salonId)
      .in('item_id', itemIds)
      .order('created_at', { ascending: true })

    const allTxns = (txns ?? []) as { item_id: string; type: string; quantity: number; created_at: string }[]

    const rows = (items as { id: string; name: string }[]).map(item => {
      const mine = allTxns.filter(t => t.item_id === item.id)

      const prevAdjustments = mine.filter(t => t.type === 'adjustment' && t.created_at < monthStart)
      const openingStock = prevAdjustments.length > 0
        ? prevAdjustments[prevAdjustments.length - 1].quantity
        : 0

      const newStock = mine
        .filter(t => t.type === 'restock' && t.created_at >= monthStart && t.created_at < monthEnd)
        .reduce((s, t) => s + t.quantity, 0)

      const monthAdjustments = mine.filter(t => t.type === 'adjustment' && t.created_at >= monthStart && t.created_at < monthEnd)
      const closingCount = monthAdjustments.length > 0
        ? monthAdjustments[monthAdjustments.length - 1].quantity
        : null

      const consumed = closingCount !== null ? openingStock + newStock - closingCount : null

      return { itemId: item.id, name: item.name, openingStock, newStock, closingCount, consumed }
    })

    setInvData(rows)
    setInvLoading(false)
  }

  // ── Product Sales fetch ─────────────────────────────────────────────────
  async function fetchProductSales(month: number, year: number) {
    if (!salonId) return
    setPsSalesLoading(true)
    const monthStart = new Date(year, month - 1, 1).toISOString()
    const monthEnd   = new Date(year, month, 1).toISOString()

    const [{ data: txns }, { data: pays }] = await Promise.all([
      supabase
        .from('inventory_transactions')
        .select('id, item_id, quantity, price_sold, margin_retained, created_at, inventory_items(name, commission_pct)')
        .eq('salon_id', salonId)
        .eq('type', 'sale')
        .gte('created_at', monthStart)
        .lt('created_at', monthEnd)
        .order('created_at', { ascending: false }),
      supabase
        .from('payments')
        .select('id, client_id, staff_id, created_at')
        .eq('salon_id', salonId)
        .eq('reference', 'product_sale')
        .eq('status', 'completed')
        .gte('created_at', monthStart)
        .lt('created_at', monthEnd),
    ])

    const clientIds = [...new Set((pays ?? []).map(p => p.client_id as string).filter(Boolean))]
    const staffIds  = [...new Set((pays ?? []).map(p => p.staff_id  as string).filter(Boolean))]

    const [{ data: clientsData }, { data: staffData }] = await Promise.all([
      clientIds.length > 0
        ? supabase.from('clients').select('id, name').in('id', clientIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      staffIds.length > 0
        ? supabase.from('staff').select('id, name').in('id', staffIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ])

    const clientMap: Record<string, string> = {}
    for (const c of clientsData ?? []) clientMap[(c as { id: string; name: string }).id] = (c as { id: string; name: string }).name
    const staffMap: Record<string, string> = {}
    for (const s of staffData ?? []) staffMap[(s as { id: string; name: string }).id] = (s as { id: string; name: string }).name

    const rows: ProductSaleRow[] = (txns ?? []).map(tx => {
      const txTime = new Date(tx.created_at as string).getTime()
      const matchedPay = (pays ?? []).find(p => Math.abs(new Date(p.created_at as string).getTime() - txTime) <= 60000)
      const item = tx.inventory_items as unknown as { name: string; commission_pct: number | null } | null
      const commPct = item?.commission_pct ?? 0
      const marginRetained = (tx.margin_retained as number | null) ?? 0
      return {
        id:             tx.id as string,
        date:           tx.created_at as string,
        clientName:     matchedPay ? (clientMap[matchedPay.client_id as string] ?? 'No Name') : 'No Name',
        staffName:      matchedPay ? (staffMap[matchedPay.staff_id   as string] ?? '—') : '—',
        productName:    item?.name ?? '—',
        qty:            (tx.quantity as number) ?? 0,
        priceSold:      (tx.price_sold as number | null) ?? 0,
        marginRetained,
        commissionPct:  commPct,
        commission:     marginRetained * commPct / 100,
      }
    })

    setPsSalesData(rows)
    setPsSalesLoading(false)
  }

  // ── Finance fetch ───────────────────────────────────────────────────────
  async function fetchFinanceReport(month: number, year: number) {
    if (!salonId) return
    setFinanceLoading(true)
    const start = new Date(year, month - 1, 1).toISOString()
    const end   = new Date(year, month, 1).toISOString()

    const [{ data: apptRows }, { data: expRows }, { data: psRows }] = await Promise.all([
      supabase.from('appointments').select('id').eq('salon_id', salonId)
        .gte('starts_at', start).lt('starts_at', end),
      supabase.from('salon_expenses').select('id, category, name, amount')
        .eq('salon_id', salonId).eq('month', month).eq('year', year),
      supabase.from('payments').select('amount')
        .eq('salon_id', salonId).eq('reference', 'product_sale').eq('status', 'completed')
        .gte('created_at', start).lt('created_at', end),
    ])

    const apptIds = (apptRows ?? []).map(r => r.id as string)
    const payData = apptIds.length > 0
      ? (await supabase.from('payments').select('amount, method').in('appointment_id', apptIds)).data ?? []
      : []

    let cash = 0, card = 0, other = 0
    for (const p of payData) {
      const amt = (p.amount as number) ?? 0
      const m   = ((p.method as string) ?? '').toLowerCase()
      if (m === 'cash') cash += amt
      else if (m === 'card') card += amt
      else other += amt
    }
    const productSales = (psRows ?? []).reduce((s, p) => s + ((p.amount as number) ?? 0), 0)
    setFinanceProductSales(productSales)
    setFinanceIncome({ cash, card, other, total: cash + card + other + productSales })

    const allExp        = (expRows ?? []) as { id: string; category: string; name: string; amount: number }[]
    const fixedItems    = allExp.filter(e => e.category === 'fixed')
    const variableItems = allExp.filter(e => e.category === 'variable')
    const oneTimeItems  = allExp.filter(e => e.category === 'one_time')
    const fixedTotal    = fixedItems.reduce((s, e) => s + e.amount, 0)
    const variableTotal = variableItems.reduce((s, e) => s + e.amount, 0)
    const oneTimeTotal  = oneTimeItems.reduce((s, e) => s + e.amount, 0)
    let loyaltyDiscount = 0
    let blindBoxDiscount = 0
    if (apptIds.length > 0) {
      const { data: loyCfg } = await supabase
        .from('loyalty_config').select('value_per_point').eq('salon_id', salonId).maybeSingle()
      const valuePerPoint = (loyCfg?.value_per_point as number | null) ?? 0
      const [{ data: loyRows }, { data: bbRows }] = await Promise.all([
        supabase.from('loyalty_points_ledger')
          .select('points').eq('salon_id', salonId).eq('type', 'redemption').in('reference_id', apptIds),
        supabase.from('blind_box_rewards')
          .select('appointment_id, redeemed_appointment_id, catalogue_price, discounted_price').eq('salon_id', salonId),
      ])
      loyaltyDiscount = (loyRows ?? []).reduce((s, r) => s + Math.abs((r.points as number | null) ?? 0) * valuePerPoint, 0)
      blindBoxDiscount = (bbRows ?? []).reduce((s, b) => {
        const applyAppt = (b.redeemed_appointment_id as string | null) ?? (b.appointment_id as string | null)
        if (!applyAppt || !apptIds.includes(applyAppt)) return s
        return s + Math.max(0, ((b.catalogue_price as number | null) ?? 0) - ((b.discounted_price as number | null) ?? 0))
      }, 0)
    }
    const marketingItems = [
      { id: 'mkt_loyalty', name: 'Loyalty discounts', amount: loyaltyDiscount },
      { id: 'mkt_blind_box', name: 'Blind box discounts', amount: blindBoxDiscount },
    ].filter(i => i.amount > 0)
    const marketingTotal = loyaltyDiscount + blindBoxDiscount
    setFinanceExpenses({
      fixed:    { items: fixedItems,    total: fixedTotal },
      variable: { items: variableItems, total: variableTotal },
      one_time: { items: oneTimeItems,  total: oneTimeTotal },
      marketing: { items: marketingItems, total: marketingTotal },
      grandTotal: fixedTotal + variableTotal + oneTimeTotal + marketingTotal,
    })

    const { data: tipRows } = await supabase.from('tips')
      .select('amount, method, staff_id')
      .eq('salon_id', salonId)
      .gte('created_at', start).lt('created_at', end)
    const tipsData = (tipRows ?? []) as { amount: number | null; method: string | null; staff_id: string | null }[]
    const tipStaffIds = [...new Set(tipsData.map(t => t.staff_id).filter(Boolean))] as string[]
    const tipStaffNames: Record<string, string> = {}
    if (tipStaffIds.length > 0) {
      const { data: tipStaffRows } = await supabase.from('staff').select('id, name').in('id', tipStaffIds)
      for (const s of (tipStaffRows ?? [])) tipStaffNames[s.id as string] = s.name as string
    }
    const tipPerStaff = new Map<string, number>()
    let tipCardTotal = 0
    for (const t of tipsData) {
      const amt = (t.amount as number) ?? 0
      if (t.staff_id) tipPerStaff.set(t.staff_id, (tipPerStaff.get(t.staff_id) ?? 0) + amt)
      if (((t.method as string) ?? '').toLowerCase() === 'card') tipCardTotal += amt
    }
    setFinanceTips({
      perStaff: [...tipPerStaff.entries()].map(([staffId, amount]) => ({ staffId, name: tipStaffNames[staffId] ?? '—', amount })),
      cardTotal: tipCardTotal,
    })
    setFinanceLoading(false)
  }

  // ── YTD fetch ───────────────────────────────────────────────────────────
  async function fetchYTD(month: number, year: number) {
    if (!salonId || !fyStartMonth) return
    setYtdLoading(true)

    type MYPair = { month: number; year: number }
    const range: MYPair[] = []
    if (month >= fyStartMonth) {
      for (let m = fyStartMonth; m <= month; m++) range.push({ month: m, year })
    } else {
      for (let m = fyStartMonth; m <= 12; m++) range.push({ month: m, year: year - 1 })
      for (let m = 1; m <= month; m++) range.push({ month: m, year })
    }

    const monthData = await Promise.all(range.map(async ({ month: m, year: y }) => {
      const start = new Date(y, m - 1, 1).toISOString()
      const end   = new Date(y, m, 1).toISOString()

      const [{ data: apptRows }, { data: expRows }] = await Promise.all([
        supabase.from('appointments').select('id').eq('salon_id', salonId).gte('starts_at', start).lt('starts_at', end),
        supabase.from('salon_expenses').select('name, category, amount').eq('salon_id', salonId).eq('month', m).eq('year', y),
      ])

      const apptIds = (apptRows ?? []).map(r => r.id as string)
      const payData = apptIds.length > 0
        ? (await supabase.from('payments').select('amount').in('appointment_id', apptIds)).data ?? []
        : []

      const income   = payData.reduce((s, p) => s + ((p.amount as number) ?? 0), 0)
      const expenses = (expRows ?? []) as { name: string; category: string; amount: number }[]
      return { month: m, year: y, income, expenses }
    }))

    const totalIncome   = monthData.reduce((s, m) => s + m.income, 0)
    const totalExpenses = monthData.reduce((s, m) => s + m.expenses.reduce((ss, e) => ss + e.amount, 0), 0)
    setYtdData({ months: monthData, totalIncome, totalExpenses, net: totalIncome - totalExpenses })
    setYtdLoading(false)
  }

  // ── Payroll: open cycle ─────────────────────────────────────────────────
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
        period_year:        r.period_year  as number,
        created_at:         (r.created_at as string) ?? '',
      }
    })

    setSelectedCycle({ period_month: c.period_month, period_year: c.period_year, rows })
    setDetailLoading(false)
  }

  // ── Payroll: download slip ──────────────────────────────────────────────
  async function downloadSlip(row: CyclePayrollRow) {
    if (!selectedCycle) return
    setGenerating(true)
    const { data: advData } = await supabase
      .from('staff_advances').select('*').eq('staff_id', row.staff_id).eq('status', 'active')
    const advances = (advData ?? []) as AdvanceRow[]
    const html = buildSlipHTML({
      salonName:         resolvedSalonName || 'Salon',
      staffName:         row.staff_name,
      staffRole:         row.staff_role,
      month:             selectedCycle.period_month,
      year:              selectedCycle.period_year,
      basicSalary:       row.basic_salary,
      commissionEarned:  row.commission_earned,
      advanceDeductions: row.advance_deductions,
      netPayable:        row.net_payable,
      advances,
    })
    openPrintWindow(html, `salary-slip-${row.staff_name}-${MONTHS[selectedCycle.period_month - 1]}-${selectedCycle.period_year}`)
    setGenerating(false)
  }

  // ── Payroll: download consolidated ─────────────────────────────────────
  async function downloadConsolidated() {
    if (!selectedCycle) return
    setGenerating(true)
    const mostRecent = selectedCycle.rows.reduce((acc, r) => r.created_at > acc ? r.created_at : acc, '')
    const runDate = mostRecent ? formatDate(mostRecent) : formatDate(new Date().toISOString())
    const html = buildConsolidatedHTML({
      salonName: resolvedSalonName || 'Salon',
      month:     selectedCycle.period_month,
      year:      selectedCycle.period_year,
      rows:      selectedCycle.rows.map(r => ({
        staff_name:         r.staff_name,
        staff_role:         r.staff_role,
        basic_salary:       r.basic_salary,
        commission_earned:  r.commission_earned,
        advance_deductions: r.advance_deductions,
        net_payable:        r.net_payable,
      })),
      runDate,
    })
    openPrintWindow(html, `payroll-${MONTHS[selectedCycle.period_month - 1]}-${selectedCycle.period_year}`)
    setGenerating(false)
  }

  // ── Computed ────────────────────────────────────────────────────────────
  const cycleTotals = selectedCycle
    ? selectedCycle.rows.reduce((acc, r) => ({
        basic:      acc.basic      + r.basic_salary,
        commission: acc.commission + r.commission_earned,
        deductions: acc.deductions + r.advance_deductions,
        net:        acc.net        + r.net_payable,
      }), { basic: 0, commission: 0, deductions: 0, net: 0 })
    : null

  const financeNet  = (financeIncome.total + financeExpenses.marketing.total) - financeExpenses.grandTotal
  const fyStartYear = (fyStartMonth !== null && selectedMonth >= fyStartMonth) ? selectedYear : selectedYear - 1
  const ytdTitle    = fyStartMonth
    ? `YTD Balance Sheet — ${MONTHS[fyStartMonth - 1]} ${fyStartYear} – ${MONTHS[selectedMonth - 1]} ${selectedYear}`
    : 'YTD Balance Sheet'

  // ── Shared style atoms ──────────────────────────────────────────────────
  const selStyle: React.CSSProperties = {
    fontSize: 12, color: '#111', border: '0.5px solid #d1d5db',
    borderRadius: 6, padding: '5px 10px', backgroundColor: '#fff',
  }
  const subLabel: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: '#6b7280',
    textTransform: 'uppercase' as const, letterSpacing: '0.04em', margin: '0 0 8px',
  }
  const backBtn: React.CSSProperties = {
    backgroundColor: 'transparent', color: '#034325',
    border: '0.5px solid #034325', borderRadius: 6,
    padding: '5px 12px', fontSize: 12, cursor: 'pointer',
  }
  const dlBtn: React.CSSProperties = {
    backgroundColor: '#034325', color: '#ffffff',
    border: 'none', borderRadius: 6,
    padding: '6px 14px', fontSize: 12, cursor: 'pointer',
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', display: 'flex', flexDirection: 'column' }}>
      <Topbar />

      <div style={{ marginTop: 52, flex: 1, padding: '20px 28px 32px' }}>

        {/* ── Modal overlay ── */}
        {showModal !== null && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minHeight: 400,
          }}>
            <div style={{
              backgroundColor: '#fff', borderRadius: 10, padding: 24,
              width: 320, boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
            }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#111', margin: '0 0 18px' }}>Select period</p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
                <select
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(Number(e.target.value))}
                  style={{ ...selStyle, flex: 1 }}
                >
                  {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                </select>
                <select
                  value={selectedYear}
                  onChange={e => setSelectedYear(Number(e.target.value))}
                  style={selStyle}
                >
                  {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setShowModal(null)} style={backBtn}>Cancel</button>
                <button
                  onClick={() => {
                    const type = showModal
                    setShowModal(null)
                    if (type === 'finance') {
                      setView('finance')
                      fetchFinanceReport(selectedMonth, selectedYear)
                    } else {
                      setView('payroll')
                    }
                  }}
                  style={dlBtn}
                >View Report</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Landing ── */}
        {view === 'landing' && (
          <>
            <p style={{ fontSize: 16, fontWeight: 500, color: '#111', margin: '0 0 16px' }}>Reports</p>
            <div style={cardStyle}>
              {canViewFinance && (
                <div
                  onClick={() => setShowModal('finance')}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '14px 8px', cursor: 'pointer', borderBottom: '0.5px solid #f0f0f0',
                  }}
                >
                  <div>
                    <p style={{ margin: 0, fontSize: 14, color: '#111', fontWeight: 500 }}>Finance Report</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6b7280' }}>Income, expenses, net</p>
                  </div>
                  <span style={{ color: '#9ca3af', fontSize: 20, lineHeight: 1 }}>›</span>
                </div>
              )}
              <div
                onClick={() => setShowModal('payroll')}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '14px 8px', cursor: 'pointer',
                  borderBottom: canViewTopRunner ? '0.5px solid #f0f0f0' : 'none',
                }}
              >
                <div>
                  <p style={{ margin: 0, fontSize: 14, color: '#111', fontWeight: 500 }}>Payroll History</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6b7280' }}>Salary slips, payroll cycles</p>
                </div>
                <span style={{ color: '#9ca3af', fontSize: 20, lineHeight: 1 }}>›</span>
              </div>
              {canViewTopRunner && (
                <div
                  onClick={() => setView('toprunner')}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '14px 8px', cursor: 'pointer',
                    borderBottom: '0.5px solid #f0f0f0',
                  }}
                >
                  <div>
                    <p style={{ margin: 0, fontSize: 14, color: '#111', fontWeight: 500 }}>Top Runner Report</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6b7280' }}>Daily, weekly, monthly, yearly staff leaderboard</p>
                  </div>
                  <span style={{ color: '#9ca3af', fontSize: 20, lineHeight: 1 }}>›</span>
                </div>
              )}
              {canViewTopRunner && (
                <div
                  onClick={() => setView('topclients')}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '14px 8px', cursor: 'pointer',
                    borderBottom: canViewTopRunner ? '0.5px solid #f0f0f0' : 'none',
                  }}
                >
                  <div>
                    <p style={{ margin: 0, fontSize: 14, color: '#111', fontWeight: 500 }}>Top Clients Report</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6b7280' }}>Daily, weekly, monthly, yearly client spend leaderboard</p>
                  </div>
                  <span style={{ color: '#9ca3af', fontSize: 20, lineHeight: 1 }}>›</span>
                </div>
              )}
              {role === 'owner' && (
                <div
                  onClick={() => setView('inv-landing')}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '14px 8px', cursor: 'pointer',
                  }}
                >
                  <div>
                    <p style={{ margin: 0, fontSize: 14, color: '#111', fontWeight: 500 }}>Inventory Report</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6b7280' }}>Product sales and salon supply consumption</p>
                  </div>
                  <span style={{ color: '#9ca3af', fontSize: 20, lineHeight: 1 }}>›</span>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Finance Report ── */}
        {view === 'finance' && canViewFinance && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={() => setView('landing')} style={backBtn}>Back</button>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: '#111' }}>
                  Finance Report — {MONTHS[selectedMonth - 1]} {selectedYear}
                </p>
              </div>
              <button
                onClick={() => openPrintWindow(
                  buildFinancePDF({
                    salonName: resolvedSalonName || 'Salon',
                    month: selectedMonth, year: selectedYear,
                    income: { ...financeIncome, productSales: financeProductSales }, expenses: financeExpenses, tips: financeTips,
                  }),
                  `finance-report-${MONTHS[selectedMonth - 1]}-${selectedYear}`
                )}
                style={dlBtn}
              >Download PDF</button>
            </div>

            {financeLoading ? (
              <div style={cardStyle}><p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>Loading...</p></div>
            ) : (
              <div style={cardStyle}>
                {/* Income */}
                <p style={subLabel}>Income</p>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
                  <tbody>
                    <tr><td style={TD}>Cash</td><td style={{ ...TD, textAlign: 'right' }}>AED {formatMoney(financeIncome.cash)}</td></tr>
                    <tr><td style={TD}>Card</td><td style={{ ...TD, textAlign: 'right' }}>AED {formatMoney(financeIncome.card)}</td></tr>
                    <tr><td style={TD}>Other</td><td style={{ ...TD, textAlign: 'right' }}>AED {formatMoney(financeIncome.other)}</td></tr>
                    <tr><td style={TD}>Product Sales</td><td style={{ ...TD, textAlign: 'right' }}>AED {formatMoney(financeProductSales)}</td></tr>
                    <tr>
                      <td style={TD}>Cash received</td>
                      <td style={{ ...TD, textAlign: 'right' }}>AED {formatMoney(financeIncome.total)}</td>
                    </tr>
                    <tr>
                      <td style={{ ...TD, fontWeight: 600, color: '#034325', borderBottom: 'none' }}>Sales (full value)</td>
                      <td style={{ ...TD, textAlign: 'right', fontWeight: 600, color: '#034325', borderBottom: 'none' }}>AED {formatMoney(financeIncome.total + financeExpenses.marketing.total)}</td>
                    </tr>
                  </tbody>
                </table>

                {/* Fixed Expenses */}
                <p style={subLabel}>Fixed Expenses</p>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
                  <tbody>
                    {financeExpenses.fixed.items.length === 0 ? (
                      <tr><td colSpan={2} style={{ ...TD, color: '#6b7280', borderBottom: 'none' }}>No expenses recorded yet</td></tr>
                    ) : (
                      <>
                        {financeExpenses.fixed.items.map(e => (
                          <tr key={e.id}><td style={TD}>{e.name}</td><td style={{ ...TD, textAlign: 'right' }}>AED {formatMoney(e.amount)}</td></tr>
                        ))}
                        <tr>
                          <td style={{ ...TD, fontWeight: 600, borderBottom: 'none' }}>Total fixed</td>
                          <td style={{ ...TD, textAlign: 'right', fontWeight: 600, borderBottom: 'none' }}>AED {formatMoney(financeExpenses.fixed.total)}</td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>

                {/* Variable Expenses */}
                <p style={subLabel}>Variable Expenses</p>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
                  <tbody>
                    {financeExpenses.variable.items.length === 0 ? (
                      <tr><td colSpan={2} style={{ ...TD, color: '#6b7280', borderBottom: 'none' }}>No expenses recorded yet</td></tr>
                    ) : (
                      <>
                        {financeExpenses.variable.items.map(e => (
                          <tr key={e.id}><td style={TD}>{e.name}</td><td style={{ ...TD, textAlign: 'right' }}>AED {formatMoney(e.amount)}</td></tr>
                        ))}
                        <tr>
                          <td style={{ ...TD, fontWeight: 600, borderBottom: 'none' }}>Total variable</td>
                          <td style={{ ...TD, textAlign: 'right', fontWeight: 600, borderBottom: 'none' }}>AED {formatMoney(financeExpenses.variable.total)}</td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>

                {/* One-Time Expenses */}
                <p style={subLabel}>One-Time Expenses</p>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
                  <tbody>
                    {financeExpenses.one_time.items.length === 0 ? (
                      <tr><td colSpan={2} style={{ ...TD, color: '#6b7280', borderBottom: 'none' }}>No expenses recorded yet</td></tr>
                    ) : (
                      <>
                        {financeExpenses.one_time.items.map(e => (
                          <tr key={e.id}><td style={TD}>{e.name}</td><td style={{ ...TD, textAlign: 'right' }}>AED {formatMoney(e.amount)}</td></tr>
                        ))}
                        <tr>
                          <td style={{ ...TD, fontWeight: 600, borderBottom: 'none' }}>Total one-time</td>
                          <td style={{ ...TD, textAlign: 'right', fontWeight: 600, borderBottom: 'none' }}>AED {formatMoney(financeExpenses.one_time.total)}</td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>

                {/* Marketing Expenses */}
                <p style={subLabel}>Marketing Expenses</p>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
                  <tbody>
                    {financeExpenses.marketing.items.length === 0 ? (
                      <tr><td colSpan={2} style={{ ...TD, color: '#6b7280', borderBottom: 'none' }}>No discounts given</td></tr>
                    ) : (
                      <>
                        {financeExpenses.marketing.items.map(e => (
                          <tr key={e.id}><td style={TD}>{e.name}</td><td style={{ ...TD, textAlign: 'right' }}>AED {formatMoney(e.amount)}</td></tr>
                        ))}
                        <tr>
                          <td style={{ ...TD, fontWeight: 600, borderBottom: 'none' }}>Total marketing</td>
                          <td style={{ ...TD, textAlign: 'right', fontWeight: 600, borderBottom: 'none' }}>AED {formatMoney(financeExpenses.marketing.total)}</td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>

                {/* Tips */}
                <p style={subLabel}>Tips</p>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
                  <tbody>
                    {financeTips.perStaff.length === 0 ? (
                      <tr><td colSpan={2} style={{ ...TD, color: '#6b7280', borderBottom: 'none' }}>No tips recorded yet</td></tr>
                    ) : (
                      <>
                        {financeTips.perStaff.map(s => (
                          <tr key={s.staffId}><td style={TD}>Tips earned, {s.name}</td><td style={{ ...TD, textAlign: 'right' }}>AED {formatMoney(s.amount)}</td></tr>
                        ))}
                        <tr>
                          <td colSpan={2} style={{ ...TD, fontSize: 11, color: '#6b7280', borderBottom: 'none' }}>AED {formatMoney(financeTips.cardTotal)} in card tips paid out to staff in cash. Not salon income, not commission.</td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>

                {/* Summary footer */}
                <div style={{ borderTop: '0.5px solid #e0e0e0', paddingTop: 14, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: fyStartMonth !== null ? 16 : 0 }}>
                  <MetricCard label="Sales (full value)" value={financeIncome.total + financeExpenses.marketing.total} valueColor="#034325" backgroundColor="#f0fdf4" />
                  <MetricCard label="Total expenses" value={financeExpenses.grandTotal} valueColor="#991b1b" />
                  <div style={{ border: '0.5px solid #e0e0e0', borderRadius: 6, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Net — {MONTHS[selectedMonth - 1]} {selectedYear}
                    </span>
                    <span style={{ fontSize: 16, fontWeight: 600, color: financeNet > 0 ? '#034325' : financeNet < 0 ? '#991b1b' : '#111' }}>
                      AED {financeNet.toLocaleString('en-AE', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>

                {/* YTD subsection */}
                {fyStartMonth !== null && (
                  <div style={{ borderTop: '0.5px solid #e0e0e0', paddingTop: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#111' }}>YTD Balance Sheet</p>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6b7280' }}>
                          {MONTHS[fyStartMonth - 1]} {fyStartYear} – {MONTHS[selectedMonth - 1]} {selectedYear}
                        </p>
                      </div>
                      <button
                        onClick={() => { setView('ytd'); fetchYTD(selectedMonth, selectedYear) }}
                        style={dlBtn}
                      >View YTD</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── YTD Balance Sheet ── */}
        {view === 'ytd' && canViewFinance && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={() => setView('finance')} style={backBtn}>Back</button>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: '#111' }}>{ytdTitle}</p>
              </div>
              <button
                onClick={() => {
                  if (fyStartMonth) openPrintWindow(
                    buildYTDPDF({ salonName: resolvedSalonName || 'Salon', fyStartMonth, selectedMonth, selectedYear, ytdData }),
                    `ytd-${MONTHS[selectedMonth - 1]}-${selectedYear}`
                  )
                }}
                style={dlBtn}
              >Download PDF</button>
            </div>

            {ytdLoading ? (
              <div style={cardStyle}><p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>Loading...</p></div>
            ) : (
              <div style={cardStyle}>
                {ytdData.months.map(m => {
                  const expTotal = m.expenses.reduce((s, e) => s + e.amount, 0)
                  const monthNet = m.income - expTotal
                  return (
                    <div key={`${m.year}-${m.month}`} style={{ marginBottom: 22 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#111', margin: '0 0 8px', paddingBottom: 6, borderBottom: '0.5px solid #e0e0e0' }}>
                        {MONTHS[m.month - 1]} {m.year}
                      </p>

                      <p style={{ ...subLabel, margin: '0 0 4px' }}>Income</p>
                      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
                        <tbody>
                          <tr><td style={TD}>Total payments</td><td style={{ ...TD, textAlign: 'right' }}>AED {formatMoney(m.income)}</td></tr>
                        </tbody>
                      </table>

                      <p style={{ ...subLabel, margin: '0 0 4px' }}>Expenses</p>
                      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
                        <tbody>
                          {m.expenses.length === 0 ? (
                            <tr><td colSpan={3} style={{ ...TD, color: '#6b7280', borderBottom: 'none' }}>No expenses recorded</td></tr>
                          ) : (
                            <>
                              {m.expenses.map((e, i) => (
                                <tr key={i}>
                                  <td style={TD}>{e.name}</td>
                                  <td style={{ ...TD, color: '#6b7280', textTransform: 'capitalize' }}>{e.category.replace('_', '-')}</td>
                                  <td style={{ ...TD, textAlign: 'right' }}>AED {formatMoney(e.amount)}</td>
                                </tr>
                              ))}
                              <tr>
                                <td style={{ ...TD, fontWeight: 600, borderBottom: 'none' }} colSpan={2}>Expenses subtotal</td>
                                <td style={{ ...TD, textAlign: 'right', fontWeight: 600, borderBottom: 'none' }}>AED {formatMoney(expTotal)}</td>
                              </tr>
                            </>
                          )}
                        </tbody>
                      </table>

                      <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 600, color: monthNet >= 0 ? '#034325' : '#991b1b' }}>
                        Net: AED {formatMoney(monthNet)}
                      </div>
                    </div>
                  )
                })}

                {/* YTD summary footer */}
                <div style={{ borderTop: '0.5px solid #e0e0e0', paddingTop: 14, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  <MetricCard label="Total income YTD" value={ytdData.totalIncome} valueColor="#034325" backgroundColor="#f0fdf4" />
                  <MetricCard label="Total expenses YTD" value={ytdData.totalExpenses} valueColor="#991b1b" />
                  <div style={{ border: '0.5px solid #e0e0e0', borderRadius: 6, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Net YTD</span>
                    <span style={{ fontSize: 16, fontWeight: 600, color: ytdData.net > 0 ? '#034325' : ytdData.net < 0 ? '#991b1b' : '#111' }}>
                      AED {ytdData.net.toLocaleString('en-AE', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Payroll ── */}
        {view === 'payroll' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <button onClick={() => { setView('landing'); setSelectedCycle(null) }} style={backBtn}>Back</button>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: '#111' }}>Payroll History</p>
            </div>

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
                      style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#ffffff', border: '0.5px solid rgba(255,255,255,0.3)', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}
                    >← Back</button>
                  </div>

                  <div style={{ padding: '18px 22px' }}>
                    {detailLoading ? (
                      <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>Loading…</p>
                    ) : (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 18 }}>
                          <MetricCard label="Total salary" value={cycleTotals.basic} />
                          <MetricCard label="Total commission" value={cycleTotals.commission} />
                          <MetricCard label="Total deductions" value={cycleTotals.deductions} valueColor="#991b1b" />
                          <MetricCard label="Net payable" value={cycleTotals.net} valueColor="#034325" backgroundColor="#f0fdf4" />
                        </div>

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
                                      style={{ backgroundColor: 'transparent', color: '#034325', border: '0.5px solid #034325', borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: generating ? 'not-allowed' : 'pointer' }}
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
                              border: 'none', borderRadius: 6, padding: '9px 16px', fontSize: 12, fontWeight: 600,
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
        )}

        {/* ── Top Runner Report ── */}
        {view === 'toprunner' && canViewTopRunner && (() => {
          const totalRevenue = topRunnerData.reduce((s, r) => s + r.revenue, 0)
          const TABS: { key: 'daily' | 'weekly' | 'monthly' | 'yearly'; label: string }[] = [
            { key: 'daily',   label: 'Daily'   },
            { key: 'weekly',  label: 'Weekly'  },
            { key: 'monthly', label: 'Monthly' },
            { key: 'yearly',  label: 'Yearly'  },
          ]
          return (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <button onClick={() => setView('landing')} style={backBtn}>Back</button>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: '#111' }}>Top Runner Report</p>
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                {TABS.map(t => {
                  const active = topRunnerTab === t.key
                  return (
                    <button
                      key={t.key}
                      onClick={() => setTopRunnerTab(t.key)}
                      style={{
                        backgroundColor: active ? '#034325' : '#ffffff',
                        color: active ? '#ffffff' : '#034325',
                        border: '0.5px solid #034325',
                        borderRadius: 6,
                        padding: '6px 14px',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {t.label}
                    </button>
                  )
                })}
              </div>

              {topRunnerLoading
                ? <p style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic', margin: '0 0 14px' }}>Loading…</p>
                : (
                  <>
                    <div style={{ marginBottom: 14 }}>
                      <MetricCard label="Total revenue" value={totalRevenue} valueColor="#034325" backgroundColor="#f0fdf4" />
                    </div>

                    <div style={cardStyle}>
                      {topRunnerData.length === 0 ? (
                        <p style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic', margin: 0 }}>
                          No completed appointments for this period
                        </p>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr>
                                <th style={{ ...TH, width: 50 }}>Rank</th>
                                <th style={TH}>Staff</th>
                                <th style={{ ...TH, textAlign: 'right' }}>Appointments</th>
                                <th style={{ ...TH, textAlign: 'right' }}>Revenue (AED)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {topRunnerData.map((r, i) => (
                                <tr key={r.name}>
                                  <td style={TD}>{i + 1}</td>
                                  <td style={TD}>{r.name}</td>
                                  <td style={{ ...TD, textAlign: 'right' }}>{r.appointments}</td>
                                  <td style={{ ...TD, textAlign: 'right' }}>{formatMoney(r.revenue)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                )}
            </div>
          )
        })()}

        {/* ── Top Clients Report ── */}
        {view === 'topclients' && canViewTopRunner && (() => {
          const totalCollected = topClientsData.reduce((s, r) => s + r.spend, 0)
          const TABS: { key: 'daily' | 'weekly' | 'monthly' | 'yearly'; label: string }[] = [
            { key: 'daily',   label: 'Daily'   },
            { key: 'weekly',  label: 'Weekly'  },
            { key: 'monthly', label: 'Monthly' },
            { key: 'yearly',  label: 'Yearly'  },
          ]
          return (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <button onClick={() => setView('landing')} style={backBtn}>Back</button>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: '#111' }}>Top Clients Report</p>
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                {TABS.map(t => {
                  const active = topClientsTab === t.key
                  return (
                    <button
                      key={t.key}
                      onClick={() => setTopClientsTab(t.key)}
                      style={{
                        backgroundColor: active ? '#034325' : '#ffffff',
                        color: active ? '#ffffff' : '#034325',
                        border: '0.5px solid #034325',
                        borderRadius: 6,
                        padding: '6px 14px',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {t.label}
                    </button>
                  )
                })}
              </div>

              {topClientsLoading
                ? <p style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic', margin: '0 0 14px' }}>Loading…</p>
                : (
                  <>
                    <div style={{ marginBottom: 14 }}>
                      <MetricCard label="Total collected" value={totalCollected} valueColor="#034325" backgroundColor="#f0fdf4" />
                    </div>

                    <div style={cardStyle}>
                      {topClientsData.length === 0 ? (
                        <p style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic', margin: 0 }}>
                          No completed appointments for this period
                        </p>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr>
                                <th style={{ ...TH, width: 50 }}>Rank</th>
                                <th style={TH}>Client</th>
                                <th style={{ ...TH, textAlign: 'right' }}>Visits</th>
                                <th style={TH}>Last Visit</th>
                                <th style={{ ...TH, textAlign: 'right' }}>Spend (AED)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {topClientsData.map((r, i) => (
                                <tr key={r.name}>
                                  <td style={TD}>{i + 1}</td>
                                  <td style={TD}>{r.name}</td>
                                  <td style={{ ...TD, textAlign: 'right' }}>{r.visits}</td>
                                  <td style={TD}>{r.last_visit}</td>
                                  <td style={{ ...TD, textAlign: 'right' }}>{formatMoney(r.spend)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                )}
            </div>
          )
        })()}

        {/* ── Inventory Report Sub-landing ── */}
        {view === 'inv-landing' && role === 'owner' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <button onClick={() => setView('landing')} style={backBtn}>Back</button>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: '#111' }}>Inventory Report</p>
            </div>
            <div style={cardStyle}>
              <div
                onClick={() => setView('inv-product-sales')}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 8px', cursor: 'pointer', borderBottom: '0.5px solid #f0f0f0' }}
              >
                <div>
                  <p style={{ margin: 0, fontSize: 14, color: '#111', fontWeight: 500 }}>Product Sales</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6b7280' }}>Sales transactions, margin, and commission</p>
                </div>
                <span style={{ color: '#9ca3af', fontSize: 20, lineHeight: 1 }}>›</span>
              </div>
              <div
                onClick={() => setView('inv-supplies')}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 8px', cursor: 'pointer' }}
              >
                <div>
                  <p style={{ margin: 0, fontSize: 14, color: '#111', fontWeight: 500 }}>Salon Supplies</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6b7280' }}>Opening stock, restocks, closing count, consumed per month</p>
                </div>
                <span style={{ color: '#9ca3af', fontSize: 20, lineHeight: 1 }}>›</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Product Sales Report ── */}
        {view === 'inv-product-sales' && role === 'owner' && (() => {
          const totQty      = psSalesData.reduce((s, r) => s + r.qty, 0)
          const totPrice    = psSalesData.reduce((s, r) => s + r.priceSold * r.qty, 0)
          const totMargin   = psSalesData.reduce((s, r) => s + r.marginRetained, 0)
          const totComm     = psSalesData.reduce((s, r) => s + r.commission, 0)
          return (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <button onClick={() => setView('inv-landing')} style={backBtn}>Back</button>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: '#111' }}>
                  Product Sales — {MONTHS[psSalesMonth - 1]} {psSalesYear}
                </p>
                <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center' }}>
                  <select value={psSalesMonth} onChange={e => setPsSalesMonth(Number(e.target.value))} style={selStyle}>
                    {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                  </select>
                  <select value={psSalesYear} onChange={e => setPsSalesYear(Number(e.target.value))} style={selStyle}>
                    {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              {psSalesLoading ? (
                <div style={cardStyle}><p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>Loading...</p></div>
              ) : psSalesData.length === 0 ? (
                <div style={cardStyle}><p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>No product sales for this period.</p></div>
              ) : (
                <div style={cardStyle}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={TH}>Date</th>
                          <th style={TH}>Client</th>
                          <th style={TH}>Staff</th>
                          <th style={TH}>Product</th>
                          <th style={{ ...TH, textAlign: 'right' }}>Qty</th>
                          <th style={{ ...TH, textAlign: 'right' }}>Price Sold</th>
                          <th style={{ ...TH, textAlign: 'right' }}>Margin Retained</th>
                          <th style={{ ...TH, textAlign: 'right' }}>Commission</th>
                        </tr>
                      </thead>
                      <tbody>
                        {psSalesData.map(row => (
                          <tr key={row.id}>
                            <td style={TD}>{formatDate(row.date)}</td>
                            <td style={TD}>{row.clientName}</td>
                            <td style={TD}>{row.staffName}</td>
                            <td style={TD}>{row.productName}</td>
                            <td style={{ ...TD, textAlign: 'right' }}>{row.qty}</td>
                            <td style={{ ...TD, textAlign: 'right' }}>{formatMoney(row.priceSold * row.qty)}</td>
                            <td style={{ ...TD, textAlign: 'right' }}>{formatMoney(row.marginRetained)}</td>
                            <td style={{ ...TD, textAlign: 'right', color: '#034325' }}>{formatMoney(row.commission)}</td>
                          </tr>
                        ))}
                        <tr>
                          <td style={{ ...TD, fontWeight: 600, borderBottom: 'none' }} colSpan={4}>Total</td>
                          <td style={{ ...TD, textAlign: 'right', fontWeight: 600, borderBottom: 'none' }}>{totQty}</td>
                          <td style={{ ...TD, textAlign: 'right', fontWeight: 600, borderBottom: 'none' }}>{formatMoney(totPrice)}</td>
                          <td style={{ ...TD, textAlign: 'right', fontWeight: 600, borderBottom: 'none' }}>{formatMoney(totMargin)}</td>
                          <td style={{ ...TD, textAlign: 'right', fontWeight: 600, borderBottom: 'none', color: '#034325' }}>{formatMoney(totComm)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        {/* ── Salon Supplies (Inventory Consumption) ── */}
        {view === 'inv-supplies' && role === 'owner' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <button onClick={() => setView('inv-landing')} style={backBtn}>Back</button>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: '#111' }}>Salon Supplies</p>
              <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center' }}>
                <select value={invMonth} onChange={e => setInvMonth(Number(e.target.value))} style={selStyle}>
                  {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                </select>
                <select value={invYear} onChange={e => setInvYear(Number(e.target.value))} style={selStyle}>
                  {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            {invLoading ? (
              <div style={cardStyle}><p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>Loading...</p></div>
            ) : invData.length === 0 ? (
              <div style={cardStyle}><p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>No supply items found.</p></div>
            ) : (
              <div style={cardStyle}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={TH}>Item</th>
                        <th style={{ ...TH, textAlign: 'right' }}>Opening stock</th>
                        <th style={{ ...TH, textAlign: 'right' }}>New Stock received</th>
                        <th style={{ ...TH, textAlign: 'right' }}>Closing count</th>
                        <th style={{ ...TH, textAlign: 'right' }}>Consumed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invData.map(row => (
                        <tr key={row.itemId}>
                          <td style={TD}>{row.name}</td>
                          <td style={{ ...TD, textAlign: 'right' }}>{row.openingStock}</td>
                          <td style={{ ...TD, textAlign: 'right' }}>{row.newStock}</td>
                          <td style={{ ...TD, textAlign: 'right', color: row.closingCount === null ? '#9ca3af' : '#111' }}>
                            {row.closingCount !== null ? row.closingCount : '—'}
                          </td>
                          <td style={{ ...TD, textAlign: 'right', color: row.consumed !== null ? '#034325' : '#9ca3af', fontWeight: row.consumed !== null ? 600 : 400 }}>
                            {row.consumed !== null ? row.consumed : '—'}
                          </td>
                        </tr>
                      ))}
                      {/* Totals row */}
                      <tr>
                        <td style={{ ...TD, fontWeight: 600, borderBottom: 'none' }}>Total</td>
                        <td style={{ ...TD, textAlign: 'right', fontWeight: 600, borderBottom: 'none' }}>
                          {invData.reduce((s, r) => s + r.openingStock, 0)}
                        </td>
                        <td style={{ ...TD, textAlign: 'right', fontWeight: 600, borderBottom: 'none' }}>
                          {invData.reduce((s, r) => s + r.newStock, 0)}
                        </td>
                        <td style={{ ...TD, textAlign: 'right', fontWeight: 600, borderBottom: 'none', color: '#9ca3af' }}>—</td>
                        <td style={{ ...TD, textAlign: 'right', fontWeight: 600, borderBottom: 'none', color: '#034325' }}>
                          {invData.every(r => r.consumed !== null)
                            ? invData.reduce((s, r) => s + (r.consumed ?? 0), 0)
                            : '—'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

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
