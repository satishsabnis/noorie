import { useState, useEffect, useCallback, useRef } from 'react'
import Topbar from '../components/Topbar'
import LoyaltyAdmin from './LoyaltyAdmin'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useIsMobile } from '../hooks/useIsMobile'


// ── Constants ─────────────────────────────────────────────────────────────────

const SECTIONS = [
  'Salon details', 'Services', 'Payments', 'WhatsApp',
  'Loyalty points', 'Noorie AI', 'Inventory', 'Expenses', 'Staff settings', 'Run payroll',
] as const
type Section = typeof SECTIONS[number]

const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] as const
type Day = typeof DAYS[number]

const UAE_CITIES = ['Dubai','Abu Dhabi','Sharjah','Ajman','Ras Al Khaimah','Fujairah','Umm Al Quwain','Al Ain']
const COUNTRIES = [
  { label: 'United Arab Emirates', hasCities: true },
  { label: 'Saudi Arabia', hasCities: false },
  { label: 'Kuwait', hasCities: false },
  { label: 'Qatar', hasCities: false },
  { label: 'Bahrain', hasCities: false },
  { label: 'Oman', hasCities: false },
  { label: 'India', hasCities: false },
  { label: 'United Kingdom', hasCities: false },
  { label: 'United States', hasCities: false },
]

const COUNTRY_PHONE: Record<string, { flag: string; code: string }> = {
  'United Arab Emirates': { flag: '🇦🇪', code: '+971' },
  'Saudi Arabia':         { flag: '🇸🇦', code: '+966' },
  'Kuwait':               { flag: '🇰🇼', code: '+965' },
  'Qatar':                { flag: '🇶🇦', code: '+974' },
  'Bahrain':              { flag: '🇧🇭', code: '+973' },
  'Oman':                 { flag: '🇴🇲', code: '+968' },
  'India':                { flag: '🇮🇳', code: '+91'  },
  'United Kingdom':       { flag: '🇬🇧', code: '+44'  },
  'United States':        { flag: '🇺🇸', code: '+1'   },
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface DayConfig { open: boolean; from: string; to: string }
type OperatingHours = Record<Day, DayConfig>

interface SalonData {
  id: string; name: string; address_line1: string; address_line2: string
  city: string; country: string; phone: string; email: string
  service_pricing_mode: string
}

interface ConfigData {
  id: string
  operating_hours: OperatingHours
  allow_partial_payments: boolean
  payment_methods_cash: boolean; payment_methods_card: boolean; payment_methods_online: boolean
  currency: string
  whatsapp_enabled: boolean; whatsapp_confirmation: boolean; whatsapp_reminder: boolean
  whatsapp_reminder_hours: string; whatsapp_birthday: boolean; whatsapp_birthday_timing: string
  whatsapp_payment_receipt: boolean
  loyalty_points_enabled: boolean; loyalty_earning_rate: number; loyalty_redemption_rate: number
  morning_brief_enabled: boolean; booking_assistant_enabled: boolean
  whatsapp_booking_enabled: boolean; competitor_intelligence_weekly: boolean
  competitor_last_scan: string | null
  staff_can_see_revenue: boolean; staff_can_edit_appointments: boolean
  technician_see_own_revenue: boolean; technician_collect_payments: boolean
  payroll_mode: string; payroll_mode_cycle: string
  fy_start_month: number | null
  supervisor_view_financials: boolean
  timezone: string
}

interface ServiceRow { id: string; name: string; duration_minutes: number; active: boolean; price: number; category: string; image_url: string | null }

// ── Defaults ──────────────────────────────────────────────────────────────────

const defaultHours: OperatingHours = {
  monday:    { open: true,  from: '09:00', to: '21:00' },
  tuesday:   { open: true,  from: '09:00', to: '21:00' },
  wednesday: { open: true,  from: '09:00', to: '21:00' },
  thursday:  { open: true,  from: '09:00', to: '21:00' },
  friday:    { open: false, from: '09:00', to: '21:00' },
  saturday:  { open: true,  from: '10:00', to: '22:00' },
  sunday:    { open: true,  from: '10:00', to: '22:00' },
}

const defaultSalon: SalonData = {
  id: '', name: '', address_line1: '', address_line2: '',
  city: 'Dubai', country: 'United Arab Emirates', phone: '', email: '',
  service_pricing_mode: 'manual',
}

const defaultConfig: ConfigData = {
  id: '',
  operating_hours: defaultHours,
  allow_partial_payments: true,
  payment_methods_cash: true, payment_methods_card: true, payment_methods_online: false,
  currency: 'AED',
  whatsapp_enabled: false, whatsapp_confirmation: true, whatsapp_reminder: true,
  whatsapp_reminder_hours: '24', whatsapp_birthday: true, whatsapp_birthday_timing: 'on_the_day',
  whatsapp_payment_receipt: true,
  loyalty_points_enabled: false, loyalty_earning_rate: 1, loyalty_redemption_rate: 100,
  morning_brief_enabled: true, booking_assistant_enabled: false,
  whatsapp_booking_enabled: false, competitor_intelligence_weekly: false,
  competitor_last_scan: null,
  staff_can_see_revenue: true, staff_can_edit_appointments: true,
  technician_see_own_revenue: true, technician_collect_payments: true,
  payroll_mode: 'commission', payroll_mode_cycle: 'monthly',
  fy_start_month: null,
  supervisor_view_financials: false,
  timezone: 'Asia/Dubai',
}

// ── Styles ────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  fontSize: 13, color: '#000000', border: '0.5px solid #d1d5db',
  borderRadius: 6, padding: '8px 12px', outline: 'none',
  backgroundColor: '#ffffff', boxSizing: 'border-box', width: '100%',
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.04em',
  display: 'block', marginBottom: 5,
}

const cardStyle: React.CSSProperties = {
  backgroundColor: '#f9fafb', border: '0.5px solid #e0e0e0',
  borderRadius: 8, padding: 16, marginBottom: 14,
}

const subHeading: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#034325', margin: '0 0 12px' }

// ── Toggle component ──────────────────────────────────────────────────────────

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!on)}
      style={{
        width: 36, height: 20, borderRadius: 10, cursor: 'pointer', flexShrink: 0,
        backgroundColor: on ? '#034325' : '#e0e0e0',
        position: 'relative', transition: 'background 0.15s',
      }}
    >
      <div style={{
        position: 'absolute', top: 2, borderRadius: '50%', width: 16, height: 16,
        backgroundColor: '#ffffff', transition: 'left 0.15s',
        left: on ? 18 : 2,
      }} />
    </div>
  )
}

function ToggleRow({ label, sub, on, onChange, disabled }: {
  label: string; sub?: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 0', opacity: disabled ? 0.5 : 1,
      pointerEvents: disabled ? 'none' : 'auto',
    }}>
      <div>
        <p style={{ fontSize: 13, color: '#000000', margin: 0 }}>{label}</p>
        {sub && <p style={{ fontSize: 11, color: '#6b7280', margin: '2px 0 0' }}>{sub}</p>}
      </div>
      <Toggle on={on} onChange={onChange} />
    </div>
  )
}

// ── Save / Cancel bar ─────────────────────────────────────────────────────────

function SaveBar({ dirty, saving, onSave, onCancel }: {
  dirty: boolean; saving: boolean; onSave: () => void; onCancel: () => void
}) {
  return (
    <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
      <button
        onClick={onSave} disabled={!dirty || saving}
        style={{
          backgroundColor: dirty && !saving ? '#034325' : '#e0e0e0',
          color: dirty && !saving ? '#ffffff' : '#9ca3af',
          border: 'none', borderRadius: 6, padding: '9px 24px',
          fontSize: 13, fontWeight: 600, cursor: dirty && !saving ? 'pointer' : 'not-allowed',
        }}
      >{saving ? 'Saving…' : 'Save changes'}</button>
      <button
        onClick={onCancel}
        style={{
          backgroundColor: 'transparent', color: '#6b7280',
          border: '0.5px solid #d1d5db', borderRadius: 6, padding: '9px 20px',
          fontSize: 13, cursor: 'pointer',
        }}
      >Cancel</button>
    </div>
  )
}

// ── Accordion header ──────────────────────────────────────────────────────────

function AccordionHeader({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 16px', borderRadius: open ? '8px 8px 0 0' : 8, cursor: 'pointer',
        backgroundColor: open ? '#034325' : '#f9fafb',
        border: '0.5px solid #e0e0e0',
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 500, color: open ? '#ffffff' : '#111111' }}>{label}</span>
      <span style={{ fontSize: 18, lineHeight: 1, color: open ? '#00BF00' : '#034325', fontWeight: 400 }}>{open ? '−' : '+'}</span>
    </div>
  )
}

// ── Required label helper ─────────────────────────────────────────────────────

function Req() { return <span style={{ color: '#991b1b', marginLeft: 2 }}>*</span> }

// ── Section: Salon details ────────────────────────────────────────────────────

function SectionSalon({ salon, config, salonId, onRefresh, onNameSaved }: {
  salon: SalonData; config: ConfigData; salonId: string; onRefresh: () => void; onNameSaved: (name: string) => void
}) {
  const [s, setS] = useState(salon)
  const [hours, setHours] = useState<OperatingHours>(config.operating_hours ?? defaultHours)
  const [c, setC] = useState({ payroll_mode: config.payroll_mode, payroll_mode_cycle: config.payroll_mode_cycle, timezone: config.timezone ?? 'Asia/Dubai' })
  const [committed, setCommitted] = useState(salon)
  const [committedH, setCommittedH] = useState<OperatingHours>(config.operating_hours ?? defaultHours)
  const [committedC, setCommittedC] = useState({ payroll_mode: config.payroll_mode, payroll_mode_cycle: config.payroll_mode_cycle, timezone: config.timezone ?? 'Asia/Dubai' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [openInfo, setOpenInfo] = useState(true)
  const [openHours, setOpenHours] = useState(false)
  const [openPayroll, setOpenPayroll] = useState(false)
  const [fyStartMonth, setFyStartMonth] = useState<number | null>(config.fy_start_month ?? null)
  const [committedFyStartMonth, setCommittedFyStartMonth] = useState<number | null>(config.fy_start_month ?? null)
  const isMobile = useIsMobile()

  useEffect(() => {
    setS(salon); setCommitted(salon)
    setHours(config.operating_hours ?? defaultHours); setCommittedH(config.operating_hours ?? defaultHours)
    const p = { payroll_mode: config.payroll_mode, payroll_mode_cycle: config.payroll_mode_cycle, timezone: config.timezone ?? 'Asia/Dubai' }
    setC(p); setCommittedC(p)
    setFyStartMonth(config.fy_start_month ?? null)
    setCommittedFyStartMonth(config.fy_start_month ?? null)
  }, [salon, config])

  function upS(k: keyof SalonData, v: string) { setS(p => ({ ...p, [k]: v })) }
  function upH(day: Day, k: keyof DayConfig, v: string | boolean) {
    setHours(p => ({ ...p, [day]: { ...p[day], [k]: v } }))
  }
  function upC(k: keyof typeof c, v: string) { setC(p => ({ ...p, [k]: v })) }

  const dirty = JSON.stringify(s) !== JSON.stringify(committed) || JSON.stringify(hours) !== JSON.stringify(committedH) || JSON.stringify(c) !== JSON.stringify(committedC) || fyStartMonth !== committedFyStartMonth

  const isUAE = s.country === 'United Arab Emirates'

  async function save() {
    console.log('salonId at save:', salonId)
    if (!salonId) { setError('Salon ID missing'); return }
    setSaving(true); setError(null)
    try {
      const { data: d1, error: e1 } = await supabase.from('salons').update({
        name: s.name, address_line1: s.address_line1, address_line2: s.address_line2,
        city: s.city, country: s.country, phone: s.phone, email: s.email,
        service_pricing_mode: s.service_pricing_mode,
      }).eq('id', salonId).select()
      console.log('[Admin] Salon salons update:', { data: d1, error: e1 })
      if (e1) { setError(e1.message); setSaving(false); return }
      const { data: d2, error: e2 } = await supabase.from('salon_config').update({
        payroll_mode: c.payroll_mode, payroll_mode_cycle: c.payroll_mode_cycle, operating_hours: hours,
        fy_start_month: fyStartMonth, timezone: c.timezone,
      }).eq('salon_id', salonId).select()
      console.log('[Admin] Salon salon_config update:', { data: d2, error: e2 })
      if (e2) { setError(e2.message); setSaving(false); return }
      setCommitted(s); setCommittedH(hours); setCommittedC(c); setCommittedFyStartMonth(fyStartMonth)
      onNameSaved(s.name)
      setSaving(false); setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error('[Admin] Salon save exception:', err)
      setError('Unexpected error — check console.'); setSaving(false)
    }
  }

  const fieldStyle: React.CSSProperties = { ...inputStyle, padding: '8px 12px' }

  return (
    <div>
      <p style={{ fontSize: 16, fontWeight: 500, color: '#111', margin: '0 0 16px' }}>Salon details</p>

      {/* Accordion 1 — Salon information */}
      <div style={{ marginBottom: 10 }}>
        <AccordionHeader label="Salon information" open={openInfo} onToggle={() => setOpenInfo(p => !p)} />
        {openInfo && (
          <div style={{ border: '0.5px solid #e0e0e0', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: 16, backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', gap: 12 }}>

            <div>
              <label style={labelStyle}>Salon name<Req /></label>
              <input value={s.name} onChange={e => upS('name', e.target.value)} style={fieldStyle} placeholder="Salon name" />
            </div>

            <div>
              <label style={labelStyle}>Address line 1<Req /></label>
              <input value={s.address_line1} onChange={e => upS('address_line1', e.target.value)} style={fieldStyle} placeholder="Building / street" />
            </div>

            <div>
              <label style={labelStyle}>Address line 2</label>
              <input value={s.address_line2} onChange={e => upS('address_line2', e.target.value)} style={fieldStyle} placeholder="Area / landmark (optional)" />
            </div>

            <div>
              <label style={labelStyle}>Country<Req /></label>
              <select value={s.country} onChange={e => { upS('country', e.target.value); upS('city', ''); upS('phone', '') }} style={{ ...fieldStyle, appearance: 'none', cursor: 'pointer' }}>
                {COUNTRIES.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
              </select>
            </div>

            <div>
              <label style={labelStyle}>City<Req /></label>
              {isUAE
                ? <select value={s.city} onChange={e => upS('city', e.target.value)} style={{ ...fieldStyle, appearance: 'none', cursor: 'pointer' }}>
                    {UAE_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                : <input value={s.city} onChange={e => upS('city', e.target.value)} style={fieldStyle} placeholder="City" />
              }
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Phone<Req /></label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    height: 36, padding: '0 10px',
                    border: '0.5px solid #e0e0e0', borderRadius: 6,
                    backgroundColor: '#f9f9f9',
                    fontSize: 13, whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    <span style={{ fontSize: 18, lineHeight: 1 }}>
                      {COUNTRY_PHONE[s.country]?.flag ?? '🌐'}
                    </span>
                    <span style={{ color: '#333' }}>
                      {COUNTRY_PHONE[s.country]?.code ?? ''}
                    </span>
                  </div>
                  <input
                    value={s.phone}
                    onChange={e => upS('phone', e.target.value)}
                    style={{ ...fieldStyle, flex: 1 }}
                    type="tel"
                    placeholder="50 123 4567"
                  />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input value={s.email} onChange={e => upS('email', e.target.value)} style={fieldStyle} type="email" placeholder="salon@example.com" />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Pricing mode<Req /></label>
              <select value={s.service_pricing_mode} onChange={e => upS('service_pricing_mode', e.target.value)} style={{ ...fieldStyle, appearance: 'none', cursor: 'pointer' }}>
                <option value="manual">Manual</option>
                <option value="catalogue">Catalogue</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Timezone</label>
              <select value={c.timezone} onChange={e => upC('timezone', e.target.value)} style={{ ...fieldStyle, appearance: 'none', cursor: 'pointer' }}>
                <option value="Asia/Dubai">United Arab Emirates</option>
                <option value="Asia/Muscat">Oman</option>
                <option value="Asia/Qatar">Qatar</option>
                <option value="Asia/Kuwait">Kuwait</option>
                <option value="Asia/Bahrain">Bahrain</option>
                <option value="Asia/Riyadh">Saudi Arabia</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Financial year start month</label>
              <select
                value={fyStartMonth ?? ''}
                onChange={e => setFyStartMonth(e.target.value === '' ? null : Number(e.target.value))}
                style={{ ...fieldStyle, appearance: 'none', cursor: 'pointer' }}
              >
                <option value="">Not set</option>
                {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </div>

          </div>
        )}
      </div>

      {/* Accordion 2 — Operating hours */}
      <div style={{ marginBottom: 10 }}>
        <AccordionHeader label="Operating hours" open={openHours} onToggle={() => setOpenHours(p => !p)} />
        {openHours && (
          <div style={{ border: '0.5px solid #e0e0e0', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: 16, backgroundColor: '#ffffff' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {DAYS.map(day => {
                const d = hours[day] ?? { open: true, from: '09:00', to: '21:00' }
                return (
                  <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                    <span style={{ fontSize: 12, color: '#374151', width: 90, textTransform: 'capitalize', flexShrink: 0 }}>{day}</span>
                    <input
                      type="checkbox" checked={d.open}
                      onChange={e => upH(day, 'open', e.target.checked)}
                      style={{ accentColor: '#034325', width: 15, height: 15, flexShrink: 0, cursor: 'pointer' }}
                    />
                    {d.open ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, ...(isMobile ? { flexBasis: '100%' } : {}) }}>
                        <input type="time" value={d.from} onChange={e => upH(day, 'from', e.target.value)}
                          style={{ ...fieldStyle, width: 110 }} />
                        <span style={{ fontSize: 12, color: '#6b7280', flexShrink: 0 }}>to</span>
                        <input type="time" value={d.to} onChange={e => upH(day, 'to', e.target.value)}
                          style={{ ...fieldStyle, width: 110 }} />
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: '#9ca3af' }}>Closed</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Accordion 3 — Payroll settings */}
      <div style={{ marginBottom: 14 }}>
        <AccordionHeader label="Payroll settings" open={openPayroll} onToggle={() => setOpenPayroll(p => !p)} />
        {openPayroll && (
          <div style={{ border: '0.5px solid #e0e0e0', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: 16, backgroundColor: '#ffffff' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
              {/* Left — Payroll mode */}
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Payroll mode</label>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                  {[['commission', 'Commission only'], ['salary', 'Salary only'], ['both', 'Salary + commission']].map(([val, label]) => (
                    <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                      <input type="radio" name="salon_payroll_mode" value={val} checked={c.payroll_mode === val}
                        onChange={() => upC('payroll_mode', val)}
                        style={{ accentColor: '#034325' }} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              {/* Right — Payroll cycle */}
              <div style={isMobile ? { paddingTop: 12 } : { borderLeft: '0.5px solid #e0e0e0', paddingLeft: 32, flexShrink: 0 }}>
                <label style={labelStyle}>Payroll cycle</label>
                <select value={c.payroll_mode_cycle} onChange={e => upC('payroll_mode_cycle', e.target.value)}
                  style={{ ...fieldStyle, appearance: 'none', cursor: 'pointer', width: 130 }}>
                  <option value="monthly">Monthly</option>
                  <option value="bi-weekly">Bi-weekly</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {saved && (
        <div style={{ backgroundColor: '#f0fdf4', border: '0.5px solid #034325', borderRadius: 6, padding: '8px 14px', marginBottom: 10 }}>
          <p style={{ fontSize: 12, color: '#034325', fontWeight: 500, margin: 0 }}>Changes saved</p>
        </div>
      )}
      {error && <p style={{ fontSize: 12, color: '#991b1b', margin: '0 0 10px' }}>{error}</p>}
      <SaveBar dirty={dirty} saving={saving} onSave={save} onCancel={() => { setS(committed); setHours(committedH); setC(committedC); setFyStartMonth(committedFyStartMonth) }} />
    </div>
  )
}

// ── Section: Services ─────────────────────────────────────────────────────────

function SectionServices({ salonId }: { salonId: string }) {
  const [services, setServices] = useState<ServiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDur, setEditDur] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteBlocked, setDeleteBlocked] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDur, setNewDur] = useState('')
  const [newPrice, setNewPrice] = useState<number>(0)
  const [newCategory, setNewCategory] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [uploadingSvcId, setUploadingSvcId] = useState<string | null>(null)
  const svcImgRef = useRef<HTMLInputElement | null>(null)
  const [pendingImgSvcId, setPendingImgSvcId] = useState<string | null>(null)

  async function load() {
    const { data } = await supabase.from('services').select('id, name, duration_minutes, is_active, price, category, image_url').eq('salon_id', salonId).order('name')
    setServices((data ?? []).map(s => ({
      id: s.id as string,
      name: s.name as string,
      duration_minutes: (s.duration_minutes as number) ?? 0,
      active: (s.is_active as boolean) ?? true,
      price: (s.price as number) ?? 0,
      category: (s.category as string) ?? '',
      image_url: (s.image_url as string | null) ?? null,
    })))
    setLoading(false)
  }
  useEffect(() => { load() }, [salonId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveEdit(id: string) {
    try {
      const { data, error } = await supabase.from('services').update({
        name: editName.trim(),
        duration_minutes: parseInt(editDur),
        price: parseFloat(editPrice) || 0,
        category: editCategory.trim(),
      }).eq('id', id).select()
      console.log('[Admin] Services saveEdit result:', { data, error })
      if (error) { console.error('[Admin] Services saveEdit error:', error); setError(error.message); return }
      setEditId(null); load()
    } catch (err) {
      console.error('[Admin] Services saveEdit exception:', err)
      setError('Unexpected error — check console.')
    }
  }

  async function confirmDelete(id: string) {
    try {
      const { count, error: e1 } = await supabase.from('staff_services').select('*', { count: 'exact', head: true }).eq('service_id', id)
      if (e1) { console.error('[Admin] Services confirmDelete count error:', e1); setError(e1.message); return }
      if ((count ?? 0) > 0) { setDeleteBlocked(true); return }
      const { error: e2 } = await supabase.from('services').delete().eq('id', id)
      if (e2) { console.error('[Admin] Services confirmDelete delete error:', e2); setError(e2.message); return }
      setDeleteId(null); load()
    } catch (err) {
      console.error('[Admin] Services confirmDelete exception:', err)
      setError('Unexpected error — check console.')
    }
  }

  async function toggleActive(id: string, currentActive: boolean) {
    try {
      const { data, error } = await supabase.from('services').update({ is_active: !currentActive }).eq('id', id).select()
      console.log('[Admin] Services toggleActive result:', { data, error })
      if (error) { console.error('[Admin] Services toggleActive error:', error); setError(error.message); return }
      load()
    } catch (err) {
      console.error('[Admin] Services toggleActive exception:', err)
      setError('Unexpected error — check console.')
    }
  }

  async function handleSvcImageUpload(svcId: string, file: File) {
    setUploadingSvcId(svcId)
    const ext = file.name.split('.').pop()
    const path = `${salonId}/${svcId}.${ext}`
    const { error: upErr } = await supabase.storage.from('service-images').upload(path, file, { upsert: true })
    if (upErr) { setError(upErr.message); setUploadingSvcId(null); return }
    const { data: urlData } = supabase.storage.from('service-images').getPublicUrl(path)
    const { error: updErr } = await supabase.from('services').update({ image_url: urlData.publicUrl }).eq('id', svcId)
    if (updErr) { setError(updErr.message); setUploadingSvcId(null); return }
    setServices(prev => prev.map(s => s.id === svcId ? { ...s, image_url: urlData.publicUrl } : s))
    setUploadingSvcId(null)
    setPendingImgSvcId(null)
  }

  async function addService() {
    if (!newName.trim() || !newDur.trim()) return
    setAdding(true)
    try {
      const { error } = await supabase.from('services').insert({
        salon_id: salonId,
        name: newName.trim(),
        duration_minutes: parseInt(newDur),
        price: newPrice,
        category: newCategory.trim(),
        is_active: true,
      })
      if (error) { console.error('[Admin] Services addService error:', error); setError(error.message); setAdding(false); return }
      setNewName(''); setNewDur(''); setNewPrice(0); setNewCategory(''); setAdding(false); load()
    } catch (err) {
      console.error('[Admin] Services addService exception:', err)
      setError('Unexpected error — check console.'); setAdding(false)
    }
  }

  const TH: React.CSSProperties = { textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', padding: '8px 10px', borderBottom: '0.5px solid #e0e0e0' }
  const TD: React.CSSProperties = { fontSize: 12, color: '#000', padding: '8px 10px', borderBottom: '0.5px solid #f0f0f0', verticalAlign: 'middle' }

  return (
    <div>
      <p style={{ fontSize: 16, fontWeight: 500, color: '#111', margin: '0 0 16px' }}>Services</p>
      {error && <p style={{ fontSize: 12, color: '#991b1b', margin: '0 0 10px' }}>{error}</p>}

      <div style={cardStyle}>
        <p style={subHeading}>Add new service</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 2, minWidth: 140 }}><label style={labelStyle}>Service name</label><input value={newName} onChange={e => setNewName(e.target.value)} style={inputStyle} placeholder="Service name" /></div>
          <div style={{ flex: 1, minWidth: 110 }}><label style={labelStyle}>Category</label><input value={newCategory} onChange={e => setNewCategory(e.target.value)} style={inputStyle} placeholder="Category e.g. Hair, Nails, Skin" /></div>
          <div style={{ flex: 1, minWidth: 90 }}><label style={labelStyle}>Duration (min)</label><input value={newDur} onChange={e => setNewDur(e.target.value)} type="number" style={inputStyle} placeholder="60" /></div>
          <div style={{ flex: 1, minWidth: 90 }}><label style={labelStyle}>Price (AED)</label><input value={newPrice} onChange={e => setNewPrice(parseFloat(e.target.value) || 0)} type="number" style={inputStyle} placeholder="Price (AED)" /></div>
          <button onClick={addService} disabled={adding || !newName.trim() || !newDur.trim()} style={{ backgroundColor: !newName.trim() || !newDur.trim() ? '#e0e0e0' : '#034325', color: !newName.trim() || !newDur.trim() ? '#9ca3af' : '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 12, fontWeight: 500, cursor: !newName.trim() || !newDur.trim() ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
            {adding ? '…' : '+ Add'}
          </button>
        </div>
      </div>

      {!loading && (() => {
        const cats = ['All', ...Array.from(new Set(services.map(s => s.category).filter(c => Boolean(c) && c !== 'Product'))).sort()]
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, flexShrink: 0 }}>Filter by category</label>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              style={{ border: '1px solid #1D558F', borderRadius: 6, padding: '6px 10px', fontSize: 13, outline: 'none', backgroundColor: '#ffffff', color: '#111', cursor: 'pointer' }}
            >
              {cats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )
      })()}

      <div style={{ backgroundColor: '#ffffff', border: '0.5px solid #e0e0e0', borderRadius: 8, overflowX: 'auto', marginBottom: 14 }}>
        {loading ? <p style={{ padding: 24, textAlign: 'center', fontSize: 12, color: '#6b7280', margin: 0 }}>Loading…</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={TH}>Service</th><th style={TH}>Category</th><th style={TH}>Duration</th><th style={TH}>Price (AED)</th><th style={TH}>Status</th><th style={TH}>Actions</th></tr></thead>
            <tbody>
              {(categoryFilter === 'All' ? services : services.filter(s => s.category === categoryFilter)).map(svc => (
                <tr key={svc.id} style={{ opacity: svc.active ? 1 : 0.5 }}>
                  <td style={TD}>
                    {editId === svc.id
                      ? <input value={editName} onChange={e => setEditName(e.target.value)} style={{ ...inputStyle, width: 180 }} autoFocus />
                      : svc.name}
                  </td>
                  <td style={TD}>
                    {editId === svc.id
                      ? <input value={editCategory} onChange={e => setEditCategory(e.target.value)} style={{ ...inputStyle, width: 120 }} placeholder="Category" />
                      : (svc.category || '—')}
                  </td>
                  <td style={TD}>
                    {editId === svc.id
                      ? <input value={editDur} onChange={e => setEditDur(e.target.value)} type="number" style={{ ...inputStyle, width: 80 }} />
                      : `${svc.duration_minutes} min`}
                  </td>
                  <td style={TD}>
                    {editId === svc.id
                      ? <input value={editPrice} onChange={e => setEditPrice(e.target.value)} type="number" style={{ ...inputStyle, width: 90 }} />
                      : svc.price.toLocaleString()}
                  </td>
                  <td style={TD}>
                    {!svc.active && <span style={{ fontSize: 10, backgroundColor: '#f3f4f6', color: '#6b7280', padding: '2px 8px', borderRadius: 4, fontWeight: 500 }}>Inactive</span>}
                    {svc.active && <span style={{ fontSize: 10, backgroundColor: '#f0fdf4', color: '#034325', padding: '2px 8px', borderRadius: 4, fontWeight: 500 }}>Active</span>}
                  </td>
                  <td style={TD}>
                    {editId === svc.id ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => saveEdit(svc.id)} style={{ fontSize: 11, backgroundColor: '#034325', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>Save</button>
                        <button onClick={() => setEditId(null)} style={{ fontSize: 11, backgroundColor: 'transparent', color: '#6b7280', border: '0.5px solid #d1d5db', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <button onClick={() => { console.log('Edit clicked:', svc.id); setEditId(svc.id); setEditName(svc.name); setEditDur(String(svc.duration_minutes)); setEditPrice(String(svc.price)); setEditCategory(svc.category) }} style={{ fontSize: 11, border: '0.5px solid #034325', color: '#034325', backgroundColor: 'transparent', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>Edit</button>
                        <button onClick={() => { console.log('Suspend clicked:', svc.id); toggleActive(svc.id, svc.active) }} style={{ fontSize: 11, border: `0.5px solid ${svc.active ? '#6b7280' : '#034325'}`, color: svc.active ? '#6b7280' : '#034325', backgroundColor: 'transparent', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>{svc.active ? 'Suspend' : 'Resume'}</button>
                        <button onClick={() => { setDeleteId(svc.id); setDeleteBlocked(false); setError(null) }} style={{ fontSize: 11, border: '0.5px solid #991b1b', color: '#991b1b', backgroundColor: 'transparent', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>Delete</button>
                        {svc.category === 'Package' && (
                          <>
                            <input ref={el => { if (pendingImgSvcId === svc.id) svcImgRef.current = el }} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f && pendingImgSvcId) handleSvcImageUpload(pendingImgSvcId, f) }} />
                            {svc.image_url ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <img src={svc.image_url} alt="" style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4, border: '0.5px solid #e0e0e0' }} />
                                <button onClick={() => { setPendingImgSvcId(svc.id); setTimeout(() => svcImgRef.current?.click(), 50) }} disabled={uploadingSvcId === svc.id} style={{ fontSize: 11, border: '0.5px solid #034325', color: '#034325', backgroundColor: 'transparent', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>{uploadingSvcId === svc.id ? 'Uploading…' : 'Change'}</button>
                              </div>
                            ) : (
                              <button onClick={() => { setPendingImgSvcId(svc.id); setTimeout(() => svcImgRef.current?.click(), 50) }} disabled={uploadingSvcId === svc.id} style={{ fontSize: 11, border: '0.5px solid #034325', color: '#034325', backgroundColor: 'transparent', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>{uploadingSvcId === svc.id ? 'Uploading…' : 'Add image'}</button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                    {deleteId === svc.id && (
                      <div style={{ marginTop: 6, padding: '8px 10px', backgroundColor: '#fff5f5', border: '0.5px solid #991b1b', borderRadius: 6 }}>
                        {deleteBlocked
                          ? <p style={{ fontSize: 11, color: '#991b1b', margin: '0 0 6px' }}>Cannot delete — service is assigned to staff.</p>
                          : <p style={{ fontSize: 11, color: '#991b1b', margin: '0 0 6px' }}>Delete "{svc.name}"? Cannot be undone.</p>
                        }
                        <div style={{ display: 'flex', gap: 6 }}>
                          {!deleteBlocked && <button onClick={() => confirmDelete(svc.id)} style={{ fontSize: 11, backgroundColor: '#991b1b', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>Confirm</button>}
                          <button onClick={() => setDeleteId(null)} style={{ fontSize: 11, backgroundColor: 'transparent', color: '#6b7280', border: '0.5px solid #d1d5db', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Section: Inventory ────────────────────────────────────────────────────────

interface InventoryItem {
  id: string; name: string; type: 'product' | 'supply'
  price: number | null; stock_count: number; unit: string
  low_stock_threshold: number; image_url: string | null
  commission_pct: number | null
  margin_pct: number | null
}

function SectionInventory({ salonId }: { salonId: string }) {
  type InvView = 'choose' | 'products' | 'supplies'
  const [view, setView] = useState<InvView>('choose')
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<InventoryItem | null>(null)
  const [formName, setFormName] = useState('')
  const [formPrice, setFormPrice] = useState('')
  const [formStock, setFormStock] = useState('0')
  const [formUnit, setFormUnit] = useState('ml')
  const [formThreshold, setFormThreshold] = useState('5')
  const [formImageUrl, setFormImageUrl] = useState<string | null>(null)
  const [formCommissionPct, setFormCommissionPct] = useState(0)
  const [formMarginPct,     setFormMarginPct]     = useState(0)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [stockInItem, setStockInItem] = useState<InventoryItem | null>(null)
  const [stockInQty, setStockInQty] = useState('')
  const [stockInDate, setStockInDate] = useState('')
  const [stockInSaving, setStockInSaving] = useState(false)
  const [showMonthEnd, setShowMonthEnd] = useState(false)
  const [monthEndCounts, setMonthEndCounts] = useState<Record<string, string>>({})
  const [monthEndSaving, setMonthEndSaving] = useState(false)

  async function load(type: 'product' | 'supply') {
    setLoading(true)
    const { data } = await supabase
      .from('inventory_items')
      .select('id, name, type, price, stock_count, unit, low_stock_threshold, image_url, commission_pct, margin_pct')
      .eq('salon_id', salonId).eq('type', type).order('name')
    setItems((data ?? []) as InventoryItem[])
    setLoading(false)
  }

  useEffect(() => {
    if (view === 'products') load('product')
    else if (view === 'supplies') load('supply')
  }, [view]) // eslint-disable-line react-hooks/exhaustive-deps

  function openAdd() {
    setEditItem(null); setFormName(''); setFormPrice(''); setFormStock('0')
    setFormUnit('ml'); setFormThreshold('5'); setFormImageUrl(null); setFormCommissionPct(0); setFormMarginPct(0); setShowForm(true)
  }
  function openEdit(item: InventoryItem) {
    setEditItem(item); setFormName(item.name)
    setFormPrice(item.price != null ? String(item.price) : '')
    setFormStock(String(item.stock_count)); setFormUnit(item.unit)
    setFormThreshold(String(item.low_stock_threshold)); setFormImageUrl(item.image_url)
    setFormCommissionPct(item.commission_pct ?? 0); setFormMarginPct(item.margin_pct ?? 0); setShowForm(true)
  }

  async function handleImageUpload(file: File) {
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${salonId}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('inventory-images').upload(path, file, { upsert: true })
    if (upErr) { setError(upErr.message); setUploading(false); return }
    const { data: urlData } = supabase.storage.from('inventory-images').getPublicUrl(path)
    setFormImageUrl(urlData.publicUrl); setUploading(false)
  }

  async function handleSave() {
    if (!formName.trim()) { setError('Name is required'); return }
    setSaving(true); setError(null)
    const type = view === 'products' ? 'product' : 'supply'
    const payload = {
      salon_id: salonId, name: formName.trim(), type,
      price: type === 'product' && formPrice ? parseFloat(formPrice) : null,
      stock_count: parseInt(formStock, 10) || 0,
      unit: formUnit.trim() || 'unit',
      low_stock_threshold: parseInt(formThreshold, 10) || 5,
      image_url: type === 'product' ? formImageUrl : null,
      ...(type === 'product' ? { commission_pct: formCommissionPct, margin_pct: formMarginPct } : {}),
    }
    if (editItem) {
      const { error } = await supabase.from('inventory_items').update(payload).eq('id', editItem.id)
      if (error) { setError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('inventory_items').insert(payload)
      if (error) { setError(error.message); setSaving(false); return }
    }
    setSaving(false); setShowForm(false); load(type)
  }

  async function handleDelete(id: string) {
    const type = view === 'products' ? 'product' : 'supply'
    const { error } = await supabase.from('inventory_items').delete().eq('id', id)
    if (error) { setError(error.message); return }
    load(type)
  }

  function openStockIn(item: InventoryItem) {
    setStockInItem(item)
    setStockInQty('')
    setStockInDate(new Date().toISOString().slice(0, 10))
  }

  async function handleStockIn() {
    if (!stockInItem) return
    const qty = parseInt(stockInQty, 10)
    if (!qty || qty <= 0) return
    setStockInSaving(true)
    const { error: txErr } = await supabase.from('inventory_transactions').insert({
      type: 'restock',
      item_id: stockInItem.id,
      salon_id: salonId,
      quantity: qty,
      created_at: stockInDate,
    })
    if (txErr) { setError(txErr.message); setStockInSaving(false); return }
    const { error: updErr } = await supabase
      .from('inventory_items')
      .update({ stock_count: stockInItem.stock_count + qty })
      .eq('id', stockInItem.id)
    if (updErr) { setError(updErr.message); setStockInSaving(false); return }
    setStockInItem(null)
    setStockInSaving(false)
    load('supply')
  }

  async function handleMonthEnd() {
    setMonthEndSaving(true)
    const now = new Date().toISOString()
    const entries = Object.entries(monthEndCounts).filter(([, v]) => v !== '')
    for (const [itemId, val] of entries) {
      const count = parseInt(val, 10)
      if (isNaN(count)) continue
      await supabase.from('inventory_transactions').insert({
        type: 'adjustment', item_id: itemId, salon_id: salonId, quantity: count, created_at: now,
      })
      await supabase.from('inventory_items').update({ stock_count: count }).eq('id', itemId)
    }
    setShowMonthEnd(false)
    setMonthEndCounts({})
    setMonthEndSaving(false)
    load('supply')
  }

  const TH: React.CSSProperties = { textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', padding: '8px 10px', borderBottom: '0.5px solid #e0e0e0' }
  const TD: React.CSSProperties = { fontSize: 12, color: '#000', padding: '8px 10px', borderBottom: '0.5px solid #f0f0f0', verticalAlign: 'middle' }
  const isProduct = view === 'products'

  if (view === 'choose') return (
    <div>
      <p style={{ fontSize: 16, fontWeight: 500, color: '#111', margin: '0 0 20px' }}>Inventory Management</p>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <button onClick={() => setView('products')} style={{ backgroundColor: '#034325', color: '#fff', border: 'none', borderRadius: 8, padding: '14px 28px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Products</button>
        <button onClick={() => setView('supplies')} style={{ backgroundColor: 'transparent', color: '#034325', border: '1.5px solid #034325', borderRadius: 8, padding: '14px 28px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Salon Supplies</button>
      </div>
      <div style={{ marginTop: 14 }}>
        <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 4px' }}>Products — items sold to clients (price, photo, stock)</p>
        <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>Salon Supplies — internal consumables (stock + unit only)</p>
      </div>
    </div>
  )

  return (
    <div>
      {/* Month-end count modal */}
      {showMonthEnd && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 12, maxWidth: 420, width: '90%', padding: 24, maxHeight: '70vh', overflowY: 'auto' }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#111', margin: '0 0 16px' }}>Month-end count</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              {items.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ fontSize: 13, color: '#111' }}>{item.name}</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="—"
                    value={monthEndCounts[item.id] ?? ''}
                    onChange={e => setMonthEndCounts(prev => ({ ...prev, [item.id]: e.target.value }))}
                    style={{ ...inputStyle, width: 90, textAlign: 'right' }}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleMonthEnd} disabled={monthEndSaving} style={{ backgroundColor: '#034325', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', flex: 1 }}>
                {monthEndSaving ? 'Saving…' : 'Save count'}
              </button>
              <button onClick={() => { setShowMonthEnd(false); setMonthEndCounts({}) }} style={{ backgroundColor: 'transparent', color: '#034325', border: '0.5px solid #034325', borderRadius: 6, padding: '8px 18px', fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stock In modal */}
      {stockInItem && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 12, maxWidth: 380, width: '90%', padding: 24 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#111', margin: '0 0 4px' }}>New Stock</p>
            <p style={{ fontSize: 13, color: '#034325', fontWeight: 500, margin: '0 0 16px' }}>{stockInItem.name}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <div>
                <label style={labelStyle}>Quantity</label>
                <input type="number" value={stockInQty} onChange={e => setStockInQty(e.target.value)} style={inputStyle} placeholder="0" min="1" />
              </div>
              <div>
                <label style={labelStyle}>Date</label>
                <input type="date" value={stockInDate} onChange={e => setStockInDate(e.target.value)} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleStockIn} disabled={stockInSaving} style={{ backgroundColor: '#034325', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', flex: 1 }}>
                {stockInSaving ? 'Saving…' : 'Add stock'}
              </button>
              <button onClick={() => setStockInItem(null)} style={{ backgroundColor: 'transparent', color: '#034325', border: '0.5px solid #034325', borderRadius: 6, padding: '8px 18px', fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={() => { setView('choose'); setShowForm(false); setError(null) }} style={{ background: 'none', border: '1px solid #034325', borderRadius: 6, color: '#034325', fontSize: 12, padding: '4px 12px', cursor: 'pointer' }}>Back</button>
        <p style={{ fontSize: 16, fontWeight: 500, color: '#111', margin: 0 }}>{isProduct ? 'Products' : 'Salon Supplies'}</p>
      </div>
      {error && <p style={{ fontSize: 12, color: '#991b1b', margin: '0 0 10px' }}>{error}</p>}

      {showForm && (
        <div style={cardStyle}>
          <p style={subHeading}>{editItem ? 'Edit item' : 'Add item'}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div><label style={labelStyle}>Name</label><input value={formName} onChange={e => setFormName(e.target.value)} style={inputStyle} placeholder="Name" /></div>
            {isProduct && <div><label style={labelStyle}>Price (AED)</label><input value={formPrice} onChange={e => setFormPrice(e.target.value)} type="number" style={inputStyle} placeholder="0" /></div>}
            {isProduct && <div><label style={labelStyle}>Commission %</label><input value={formCommissionPct} onChange={e => setFormCommissionPct(Number(e.target.value))} type="number" min={0} max={100} style={inputStyle} /></div>}
            {isProduct && <div><label style={labelStyle}>Margin %</label><input value={formMarginPct} onChange={e => setFormMarginPct(Number(e.target.value))} type="number" min={0} max={100} style={inputStyle} /></div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><label style={labelStyle}>Stock count</label><input value={formStock} onChange={e => setFormStock(e.target.value)} type="number" style={inputStyle} /></div>
              <div style={{ flex: 1 }}><label style={labelStyle}>Unit</label>{isProduct ? <input value={formUnit} onChange={e => setFormUnit(e.target.value)} style={inputStyle} placeholder="unit" /> : <select value={formUnit} onChange={e => setFormUnit(e.target.value)} style={inputStyle}>{['ml','L','gms','kg','pcs','sachets','bottles','tubes'].map(u => <option key={u} value={u}>{u}</option>)}</select>}</div>
              <div style={{ flex: 1 }}><label style={labelStyle}>Low stock alert</label><input value={formThreshold} onChange={e => setFormThreshold(e.target.value)} type="number" style={inputStyle} /></div>
            </div>
            {isProduct && (
              <div>
                <label style={labelStyle}>Image</label>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f) }} />
                {formImageUrl ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <img src={formImageUrl} alt="" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6, border: '0.5px solid #e0e0e0' }} />
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} style={{ fontSize: 12, border: '0.5px solid #034325', color: '#034325', backgroundColor: 'transparent', borderRadius: 4, padding: '4px 12px', cursor: 'pointer' }}>{uploading ? 'Uploading…' : 'Change'}</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} style={{ fontSize: 12, border: '0.5px solid #034325', color: '#034325', backgroundColor: 'transparent', borderRadius: 4, padding: '4px 12px', cursor: 'pointer' }}>{uploading ? 'Uploading…' : 'Add image'}</button>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button onClick={handleSave} disabled={saving} style={{ backgroundColor: saving ? '#e0e0e0' : '#034325', color: saving ? '#9ca3af' : '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? 'Saving…' : 'Save'}</button>
              <button onClick={() => { setShowForm(false); setError(null) }} style={{ backgroundColor: 'transparent', color: '#6b7280', border: '0.5px solid #d1d5db', borderRadius: 6, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {!showForm && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <button onClick={openAdd} style={{ backgroundColor: '#034325', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>+ Add {isProduct ? 'product' : 'supply'}</button>
          {!isProduct && <button onClick={() => { setMonthEndCounts({}); setShowMonthEnd(true) }} style={{ backgroundColor: 'transparent', color: '#034325', border: '1px solid #034325', borderRadius: 6, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Month-end count</button>}
        </div>
      )}

      <div style={{ backgroundColor: '#ffffff', border: '0.5px solid #e0e0e0', borderRadius: 8, overflowX: 'auto' }}>
        {loading ? <p style={{ padding: 24, textAlign: 'center', fontSize: 12, color: '#6b7280', margin: 0 }}>Loading…</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {isProduct && <th style={TH}>Image</th>}
              <th style={TH}>Name</th>
              {isProduct && <th style={TH}>Price (AED)</th>}
              {isProduct && <th style={TH}>Commission %</th>}
              {isProduct && <th style={TH}>Margin %</th>}
              <th style={TH}>Stock</th>
              <th style={TH}>Unit</th>
              <th style={TH}>Reorder level</th>
              <th style={TH}>Actions</th>
            </tr></thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={isProduct ? 9 : 5} style={{ ...TD, color: '#6b7280', textAlign: 'center', padding: 20 }}>No items yet</td></tr>}
              {items.map(item => (
                <tr key={item.id}>
                  {isProduct && <td style={TD}>{item.image_url ? <img src={item.image_url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4, border: '0.5px solid #e0e0e0' }} /> : <span style={{ fontSize: 11, color: '#9ca3af' }}>No image</span>}</td>}
                  <td style={TD}>{item.name}</td>
                  {isProduct && <td style={TD}>{item.price != null ? item.price.toLocaleString() : '—'}</td>}
                  {isProduct && <td style={TD}>{item.commission_pct ?? 0}%</td>}
                  {isProduct && <td style={TD}>{item.margin_pct ?? 0}%</td>}
                  <td style={{ ...TD, color: item.stock_count <= item.low_stock_threshold ? '#991b1b' : '#000' }}>{item.stock_count}</td>
                  <td style={TD}>{item.unit}</td>
                  <td style={TD}>{item.low_stock_threshold}</td>
                  <td style={TD}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => openEdit(item)} style={{ fontSize: 11, border: '0.5px solid #034325', color: '#034325', backgroundColor: 'transparent', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>Edit</button>
                      <button onClick={() => handleDelete(item.id)} style={{ fontSize: 11, border: '0.5px solid #991b1b', color: '#991b1b', backgroundColor: 'transparent', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>Delete</button>
                      {!isProduct && <button onClick={() => openStockIn(item)} style={{ fontSize: 11, border: '0.5px solid #C9A227', color: '#C9A227', backgroundColor: 'transparent', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>New Stock</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Section: Payments ─────────────────────────────────────────────────────────

function SectionPayments({ config, salonId, onRefresh }: { config: ConfigData; salonId: string; onRefresh: () => void }) {
  const [c, setC] = useState(config)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  useEffect(() => { setC(config); setDirty(false) }, [config])
  function up<K extends keyof ConfigData>(k: K, v: ConfigData[K]) { setC(p => ({ ...p, [k]: v })); setDirty(true) }

  async function save() {
    setSaving(true)
    try {
      const { error } = await supabase.from('salon_config').update({
        allow_partial_payments: c.allow_partial_payments,
        payment_methods_cash: c.payment_methods_cash,
        payment_methods_card: c.payment_methods_card,
        payment_methods_online: c.payment_methods_online,
        currency: c.currency,
      }).eq('salon_id', salonId)
      if (error) console.error('[Admin] Payments save error:', error)
      setSaving(false); setDirty(false); onRefresh()
    } catch (err) {
      console.error('[Admin] Payments save exception:', err)
      setSaving(false)
    }
  }

  return (
    <div>
      <p style={{ fontSize: 16, fontWeight: 500, color: '#111', margin: '0 0 16px' }}>Payments</p>
      <div style={cardStyle}>
        <ToggleRow label="Allow partial payments" on={c.allow_partial_payments} onChange={v => up('allow_partial_payments', v)} />
        <div style={{ borderTop: '0.5px solid #e0e0e0', margin: '10px 0', paddingTop: 10 }}>
          <p style={subHeading}>Payment methods</p>
          <ToggleRow label="Cash" on={c.payment_methods_cash} onChange={v => up('payment_methods_cash', v)} />
          <ToggleRow label="Card" on={c.payment_methods_card} onChange={v => up('payment_methods_card', v)} />
          <ToggleRow label="Online / Bank transfer" on={c.payment_methods_online} onChange={v => up('payment_methods_online', v)} />
        </div>
        <div style={{ borderTop: '0.5px solid #e0e0e0', margin: '10px 0', paddingTop: 10 }}>
          <label style={labelStyle}>Currency</label>
          <select value={c.currency} onChange={e => up('currency', e.target.value)} style={{ ...inputStyle, appearance: 'none', cursor: 'pointer', width: 120 }}>
            {['AED','SAR','KWD','QAR','BHD','OMR'].map(cur => <option key={cur} value={cur}>{cur}</option>)}
          </select>
        </div>
      </div>
      <SaveBar dirty={dirty} saving={saving} onSave={save} onCancel={() => { setC(config); setDirty(false) }} />
    </div>
  )
}

// ── Section: WhatsApp ─────────────────────────────────────────────────────────

function SectionWhatsApp({ config, salonId, onRefresh }: { config: ConfigData; salonId: string; onRefresh: () => void }) {
  const [c, setC] = useState(config)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const isMobile = useIsMobile()
  useEffect(() => { setC(config); setDirty(false) }, [config])
  function up<K extends keyof ConfigData>(k: K, v: ConfigData[K]) { setC(p => ({ ...p, [k]: v })); setDirty(true) }

  async function save() {
    setSaving(true)
    try {
      const { error } = await supabase.from('salon_config').update({
        whatsapp_enabled: c.whatsapp_enabled, whatsapp_confirmation: c.whatsapp_confirmation,
        whatsapp_reminder: c.whatsapp_reminder, whatsapp_reminder_hours: c.whatsapp_reminder_hours,
        whatsapp_birthday: c.whatsapp_birthday, whatsapp_birthday_timing: c.whatsapp_birthday_timing,
        whatsapp_payment_receipt: c.whatsapp_payment_receipt,
      }).eq('salon_id', salonId)
      if (error) console.error('[Admin] WhatsApp save error:', error)
      setSaving(false); setDirty(false); onRefresh()
    } catch (err) {
      console.error('[Admin] WhatsApp save exception:', err)
      setSaving(false)
    }
  }

  const off = !c.whatsapp_enabled
  return (
    <div>
      <p style={{ fontSize: 16, fontWeight: 500, color: '#111', margin: '0 0 16px' }}>WhatsApp</p>
      <div style={cardStyle}>
        <ToggleRow label="WhatsApp notifications" sub="Master on/off for all WhatsApp messages" on={c.whatsapp_enabled} onChange={v => up('whatsapp_enabled', v)} />
        <div style={{ borderTop: '0.5px solid #e0e0e0', margin: '10px 0', paddingTop: 10, opacity: off ? 0.5 : 1, pointerEvents: off ? 'none' : 'auto' }}>
          <ToggleRow label="Appointment confirmation" on={c.whatsapp_confirmation} onChange={v => up('whatsapp_confirmation', v)} />
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: isMobile ? undefined : 'space-between', padding: '8px 0' }}>
            <ToggleRow label="Appointment reminder" on={c.whatsapp_reminder} onChange={v => up('whatsapp_reminder', v)} />
            <select value={c.whatsapp_reminder_hours} onChange={e => up('whatsapp_reminder_hours', e.target.value)} style={{ ...inputStyle, width: 80, marginLeft: isMobile ? 0 : 12 }}>
              <option value="24">24h</option><option value="12">12h</option><option value="2">2h</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: isMobile ? undefined : 'space-between', padding: '8px 0' }}>
            <ToggleRow label="Birthday greeting" on={c.whatsapp_birthday} onChange={v => up('whatsapp_birthday', v)} />
            <select value={c.whatsapp_birthday_timing} onChange={e => up('whatsapp_birthday_timing', e.target.value)} style={{ ...inputStyle, width: 130, marginLeft: isMobile ? 0 : 12 }}>
              <option value="on_the_day">On the day</option>
              <option value="1_day_before">1 day before</option>
              <option value="3_days_before">3 days before</option>
            </select>
          </div>
          <ToggleRow label="Payment receipt" on={c.whatsapp_payment_receipt} onChange={v => up('whatsapp_payment_receipt', v)} />
        </div>
      </div>
      <div style={{ backgroundColor: '#fff3cd', border: '0.5px solid #C9A227', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
        <p style={{ fontSize: 12, color: '#92400e', margin: 0 }}>WhatsApp not connected — contact Blue Flute Consulting to configure Twilio.</p>
      </div>
      <SaveBar dirty={dirty} saving={saving} onSave={save} onCancel={() => { setC(config); setDirty(false) }} />
    </div>
  )
}

// ── Section: Loyalty points ───────────────────────────────────────────────────

function SectionLoyalty({ config, salonId, onRefresh }: { config: ConfigData; salonId: string; onRefresh: () => void }) {
  const [c, setC] = useState(config)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const isMobile = useIsMobile()
  useEffect(() => { setC(config); setDirty(false) }, [config])
  function up<K extends keyof ConfigData>(k: K, v: ConfigData[K]) { setC(p => ({ ...p, [k]: v })); setDirty(true) }

  async function save() {
    setSaving(true)
    try {
      const { error } = await supabase.from('salon_config').update({
        loyalty_points_enabled: c.loyalty_points_enabled,
        loyalty_earning_rate: c.loyalty_earning_rate,
        loyalty_redemption_rate: c.loyalty_redemption_rate,
      }).eq('salon_id', salonId)
      if (error) console.error('[Admin] Loyalty save error:', error)
      setSaving(false); setDirty(false); onRefresh()
    } catch (err) {
      console.error('[Admin] Loyalty save exception:', err)
      setSaving(false)
    }
  }

  return (
    <div>
      <p style={{ fontSize: 16, fontWeight: 500, color: '#111', margin: '0 0 16px' }}>Loyalty points</p>
      <div style={cardStyle}>
        <ToggleRow label="Enable loyalty points" on={c.loyalty_points_enabled} onChange={v => up('loyalty_points_enabled', v)} />
        <div style={{ borderTop: '0.5px solid #e0e0e0', margin: '10px 0', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}>Earning rate</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
              <span style={{ color: '#6b7280' }}>Client earns</span>
              <input type="number" value={c.loyalty_earning_rate} onChange={e => up('loyalty_earning_rate', parseFloat(e.target.value) || 0)} style={{ ...inputStyle, width: 70 }} />
              <span style={{ color: '#6b7280' }}>point per</span>
              <input type="number" value={c.loyalty_redemption_rate} onChange={e => up('loyalty_redemption_rate', parseFloat(e.target.value) || 0)} style={{ ...inputStyle, width: 70 }} />
              <span style={{ color: '#6b7280' }}>AED spent</span>
            </div>
          </div>
          <div>
            <label style={labelStyle}>Redemption rate</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
              <input type="number" value={c.loyalty_redemption_rate} onChange={e => up('loyalty_redemption_rate', parseFloat(e.target.value) || 0)} style={{ ...inputStyle, width: 70 }} />
              <span style={{ color: '#6b7280' }}>points =</span>
              <input type="number" value={c.loyalty_earning_rate} onChange={e => up('loyalty_earning_rate', parseFloat(e.target.value) || 0)} style={{ ...inputStyle, width: 70 }} />
              <span style={{ color: '#6b7280' }}>AED discount</span>
            </div>
          </div>
        </div>
      </div>
      <SaveBar dirty={dirty} saving={saving} onSave={save} onCancel={() => { setC(config); setDirty(false) }} />
    </div>
  )
}

// ── Types: competitor report ──────────────────────────────────────────────────

interface CompetitorReport {
  competitors: Record<string, unknown>[]
  trends: unknown[]
  offers: unknown[]
  pricing_insights: string
  loyalty_programs: unknown[]
  recommendations: unknown[]
}

function stripCiteTags(s: string): string {
  return s.replace(/<cite[^>]*>/g, '').replace(/<\/cite>/g, '')
}

function renderTrendItem(item: unknown): React.ReactNode {
  if (typeof item === 'string') return stripCiteTags(item)
  if (item && typeof item === 'object') {
    const o = item as Record<string, unknown>
    const name = o.trend ?? o.name ?? o.title
    const desc = o.description ?? o.details ?? o.detail
    if (name && desc) return <><strong>{stripCiteTags(String(name))}</strong> — {stripCiteTags(String(desc))}</>
    return stripCiteTags(Object.values(o).map(String).join(' — '))
  }
  return stripCiteTags(String(item))
}

function renderGenericItem(item: unknown): React.ReactNode {
  if (typeof item === 'string') return stripCiteTags(item)
  if (item && typeof item === 'object') {
    const o = item as Record<string, unknown>
    return stripCiteTags(Object.values(o).map(String).join(' — '))
  }
  return stripCiteTags(String(item))
}

// ── Section: Noorie AI ────────────────────────────────────────────────────────

function SectionAI({ config, salonId, salon, onRefresh }: {
  config: ConfigData; salonId: string; salon: { name: string; city: string; country: string }; onRefresh: () => void
}) {
  const [c, setC] = useState(config)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [report, setReport] = useState<CompetitorReport | null>(null)
  const [lastScan, setLastScan] = useState<string | null>(config.competitor_last_scan)
  const [copiedSection, setCopiedSection] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => { setC(config); setDirty(false); setLastScan(config.competitor_last_scan) }, [config])

  useEffect(() => {
    if (!salonId) return
    supabase.from('competitor_reports').select('report, created_at').eq('salon_id', salonId).order('created_at', { ascending: false }).limit(1).single()
      .then(({ data }) => { if (data?.report) setReport(data.report as CompetitorReport) })
  }, [salonId])

  function up<K extends keyof ConfigData>(k: K, v: ConfigData[K]) { setC(p => ({ ...p, [k]: v })); setDirty(true) }

  async function save() {
    setSaving(true)
    try {
      const { error } = await supabase.from('salon_config').update({
        morning_brief_enabled: c.morning_brief_enabled,
        booking_assistant_enabled: c.booking_assistant_enabled,
        whatsapp_booking_enabled: c.whatsapp_booking_enabled,
        competitor_intelligence_weekly: c.competitor_intelligence_weekly,
      }).eq('salon_id', salonId)
      if (error) console.error('[Admin] Noorie AI save error:', error)
      setSaving(false); setDirty(false); onRefresh()
    } catch (err) {
      console.error('[Admin] Noorie AI save exception:', err)
      setSaving(false)
    }
  }

  function cancelScan() {
    abortRef.current?.abort()
    abortRef.current = null
    setScanning(false)
  }

    async function runScan() {
    const controller = new AbortController()
    abortRef.current = controller
    setScanning(true); setScanError(null)
    try {
      const userMsg = `Research beauty salons competing with ${salon.name} in the ${salon.name} area and neighbourhood of ${salon.city}, ${salon.country}. Focus on salons within 2-3km. Return a JSON object with exactly these keys: competitors (array of objects with: name, location, services, price_range, rating, reviews_summary), trends (array of strings describing current market trends), offers (array of strings describing competitor promotions), pricing_insights (single string summarising the pricing landscape), loyalty_programs (array of strings describing loyalty schemes), recommendations (array of strings with actionable recommendations for ${salon.name}). Return ONLY the JSON object. No other text.`
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('https://eoxgaawoyftjnjkmjbmk.supabase.co/functions/v1/competitor-scan', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ prompt: userMsg, salonId }),
      })
      
      if (!res.ok) { const t = await res.text(); throw new Error(`API error ${res.status}: ${t}`) }
      const data = await res.json()
      const textBlocks = (data.content as { type: string; text?: string }[]).filter(b => b.type === 'text')
      const rawText = textBlocks[textBlocks.length - 1]?.text ?? ''

      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      const jsonStr = jsonMatch ? jsonMatch[0] : rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
      const parsed: CompetitorReport = JSON.parse(jsonStr)

      const now = new Date().toISOString()
      await Promise.all([
        supabase.from('competitor_reports').insert({ salon_id: salonId, report: parsed }),
        supabase.from('salon_config').update({ competitor_last_scan: now }).eq('salon_id', salonId),
      ])
      setReport(parsed); setLastScan(now)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') { return }
      console.error('[Admin] Competitor scan error:', err)
      setScanError(err instanceof Error ? err.message : 'Scan failed — check console.')
    } finally {
      abortRef.current = null
      setScanning(false)
    }
  }

  const TH: React.CSSProperties = { textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', padding: '6px 10px', borderBottom: '0.5px solid #e0e0e0' }
  const TD: React.CSSProperties = { fontSize: 12, color: '#111', padding: '6px 10px', borderBottom: '0.5px solid #f0f0f0', verticalAlign: 'top' }

  function copySection(key: string, text: string) {
    navigator.clipboard.writeText(text)
    setCopiedSection(key)
    setTimeout(() => setCopiedSection(k => k === key ? null : k), 2000)
  }

  const copyBtnStyle: React.CSSProperties = {
    fontSize: 11, border: '0.5px solid #034325', color: '#034325',
    backgroundColor: 'transparent', borderRadius: 4, padding: '3px 10px', cursor: 'pointer',
  }

  return (
    <>
    <div>
      <p style={{ fontSize: 16, fontWeight: 500, color: '#111', margin: '0 0 16px' }}>Noorie AI</p>
      <div style={cardStyle}>
        <ToggleRow label="Morning Brief" sub="Daily AI-generated insights shown on your dashboard" on={c.morning_brief_enabled} onChange={v => up('morning_brief_enabled', v)} />
        <ToggleRow label="Client booking assistant" sub="AI helps clients self-book via WhatsApp" on={c.booking_assistant_enabled} onChange={v => up('booking_assistant_enabled', v)} />
        <ToggleRow label="WhatsApp booking via Noorie" sub="Clients can book appointments through WhatsApp" on={c.whatsapp_booking_enabled} onChange={v => up('whatsapp_booking_enabled', v)} />
      </div>

      <div style={{ backgroundColor: '#034325', borderRadius: 8, padding: '14px 16px', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 500, color: '#ffffff', margin: '0 0 3px' }}>Competitor intelligence</p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', margin: 0 }}>Weekly scan of competitor salons in your area</p>
          </div>
          <span style={{ backgroundColor: '#C9A227', color: '#ffffff', fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4 }}>Premium</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>Weekly scan</span>
            <Toggle on={c.competitor_intelligence_weekly} onChange={v => up('competitor_intelligence_weekly', v)} />
          </div>
          <button
            onClick={runScan}
            disabled={scanning}
            style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#ffffff', border: '0.5px solid rgba(255,255,255,0.3)', borderRadius: 6, padding: '5px 14px', fontSize: 12, cursor: scanning ? 'not-allowed' : 'pointer', opacity: scanning ? 0.7 : 1 }}
          >{scanning ? 'Scanning…' : 'Run now'}</button>
          {scanning && (
            <button
                          onClick={cancelScan}
              style={{ fontSize: 11, backgroundColor: 'transparent', border: '0.5px solid #991b1b', color: '#991b1b', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}
            >Cancel</button>
          )}
          {lastScan && (
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Last scan: {new Date(lastScan).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          )}
        </div>
        {scanError && <p style={{ fontSize: 11, color: '#fca5a5', margin: '10px 0 0' }}>{scanError}</p>}
      </div>

            {report && (() => {
        try {
          return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 14 }}>

          {/* Competitors table */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <p style={{ ...subHeading, margin: 0 }}>Competitors</p>
              <button style={copyBtnStyle} onClick={() => copySection('competitors', (report.competitors ?? []).map(comp => {
                const n = comp.name ?? comp.salon_name ?? comp.business_name ?? ''
                const l = comp.location ?? comp.address ?? comp.area ?? ''
                const s = comp.services ?? comp.service_offerings ?? comp.specialties ?? ''
                const pr = comp.price_range ?? comp.pricing ?? comp.price ?? ''
                const ra = comp.rating ?? comp.score ?? comp.stars ?? ''
                const rv = comp.reviews_summary ?? comp.reviews ?? comp.review_summary ?? ''
                return `${n} | ${l} | ${Array.isArray(s) ? (s as unknown[]).map(String).join(', ') : String(s)} | ${pr} | ${ra} | ${rv}`
              }).join('\n'))}>{copiedSection === 'competitors' ? 'Copied' : 'Copy'}</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={TH}>Name</th><th style={TH}>Location</th><th style={TH}>Services</th>
                  <th style={TH}>Price range</th><th style={TH}>Rating</th><th style={TH}>Reviews</th>
                </tr></thead>
                <tbody>
                  {(report.competitors ?? []).map((comp, i) => {
                    const name = comp.name ?? comp.salon_name ?? comp.business_name ?? ''
                    const location = comp.location ?? comp.address ?? comp.area ?? ''
                    const services = comp.services ?? comp.service_offerings ?? comp.specialties ?? ''
                    const price = comp.price_range ?? comp.pricing ?? comp.price ?? ''
                    const rating = comp.rating ?? comp.score ?? comp.stars ?? ''
                    const reviews = comp.reviews_summary ?? comp.reviews ?? comp.review_summary ?? ''
                    return (
                      <tr key={i}>
                        <td style={{ ...TD, fontWeight: 500 }}>{stripCiteTags(String(name))}</td>
                        <td style={TD}>{stripCiteTags(String(location))}</td>
                        <td style={TD}>{stripCiteTags(Array.isArray(services) ? (services as unknown[]).map(String).join(', ') : String(services))}</td>
                        <td style={TD}>{stripCiteTags(String(price))}</td>
                        <td style={TD}>{stripCiteTags(String(rating))}</td>
                        <td style={TD}>{stripCiteTags(String(reviews))}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Trends */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <p style={{ ...subHeading, margin: 0 }}>Market trends</p>
              <button style={copyBtnStyle} onClick={() => copySection('trends', (report.trends ?? []).map(t => `- ${typeof t === 'string' ? t : Object.values(t as Record<string, unknown>).map(String).join(' — ')}`).join('\n'))}>{copiedSection === 'trends' ? 'Copied' : 'Copy'}</button>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(report.trends ?? []).map((t, i) => <li key={i} style={{ fontSize: 12, color: '#374151' }}>{renderTrendItem(t)}</li>)}
            </ul>
          </div>

          {/* Offers */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <p style={{ ...subHeading, margin: 0 }}>Competitor promotions</p>
              <button style={copyBtnStyle} onClick={() => copySection('offers', (report.offers ?? []).map(o => `- ${typeof o === 'string' ? o : Object.values(o as Record<string, unknown>).map(String).join(' — ')}`).join('\n'))}>{copiedSection === 'offers' ? 'Copied' : 'Copy'}</button>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(report.offers ?? []).map((o, i) => <li key={i} style={{ fontSize: 12, color: '#374151' }}>{renderGenericItem(o)}</li>)}
            </ul>
          </div>

          {/* Pricing insights */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <p style={{ ...subHeading, margin: 0 }}>Pricing landscape</p>
              <button style={copyBtnStyle} onClick={() => copySection('pricing', report.pricing_insights)}>{copiedSection === 'pricing' ? 'Copied' : 'Copy'}</button>
            </div>
            <p style={{ fontSize: 12, color: '#374151', margin: 0, lineHeight: 1.6 }}>{stripCiteTags(report.pricing_insights)}</p>
          </div>

          {/* Loyalty programs */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <p style={{ ...subHeading, margin: 0 }}>Loyalty programs</p>
              <button style={copyBtnStyle} onClick={() => copySection('loyalty', (report.loyalty_programs ?? []).map(l => `- ${typeof l === 'string' ? l : Object.values(l as Record<string, unknown>).map(String).join(' — ')}`).join('\n'))}>{copiedSection === 'loyalty' ? 'Copied' : 'Copy'}</button>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(report.loyalty_programs ?? []).map((l, i) => <li key={i} style={{ fontSize: 12, color: '#374151' }}>{renderGenericItem(l)}</li>)}
            </ul>
          </div>

          {/* Recommendations */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <p style={{ ...subHeading, margin: 0 }}>Recommendations</p>
              <button style={copyBtnStyle} onClick={() => copySection('recommendations', (report.recommendations ?? []).map(r => `- ${typeof r === 'string' ? r : Object.values(r as Record<string, unknown>).map(String).join(' — ')}`).join('\n'))}>{copiedSection === 'recommendations' ? 'Copied' : 'Copy'}</button>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(report.recommendations ?? []).map((r, i) => <li key={i} style={{ fontSize: 12, color: '#374151' }}>{renderGenericItem(r)}</li>)}
            </ul>
          </div>

        </div>
          )
        } catch {
          return <p style={{ fontSize: 12, color: '#991b1b', margin: 0 }}>Report could not be displayed</p>
        }
      })()}

      <SaveBar dirty={dirty} saving={saving} onSave={save} onCancel={() => { setC(config); setDirty(false) }} />
    </div>
    <LoyaltyAdmin salonId={salonId} />
    </>
  )
}

// ── Section: Expenses ─────────────────────────────────────────────────────────

function SectionExpenses({ salonId }: { salonId: string }) {
  const [selectedMonth,          setSelectedMonth]          = useState<number>(new Date().getMonth() + 1)
  const [selectedYear,           setSelectedYear]           = useState<number>(new Date().getFullYear())
  const [expenses,               setExpenses]               = useState<{ id: string; category: string; name: string; amount: number }[]>([])
  const [expenseName_fixed,      setExpenseName_fixed]      = useState('')
  const [expenseName_variable,   setExpenseName_variable]   = useState('')
  const [expenseName_oneTime,    setExpenseName_oneTime]    = useState('')
  const [expenseAmount_fixed,    setExpenseAmount_fixed]    = useState(0)
  const [expenseAmount_variable, setExpenseAmount_variable] = useState(0)
  const [expenseAmount_oneTime,  setExpenseAmount_oneTime]  = useState(0)
  const [expensesLoading,        setExpensesLoading]        = useState(false)

  async function fetchExpenses() {
    if (!salonId) return
    setExpensesLoading(true)
    const { data } = await supabase
      .from('salon_expenses')
      .select('id, category, name, amount')
      .eq('salon_id', salonId)
      .eq('month', selectedMonth)
      .eq('year', selectedYear)
      .order('category')
      .order('name')
    setExpenses((data ?? []) as { id: string; category: string; name: string; amount: number }[])
    setExpensesLoading(false)
  }

  async function addExpense(category: 'fixed' | 'variable' | 'one_time') {
    const name   = category === 'fixed' ? expenseName_fixed   : category === 'variable' ? expenseName_variable   : expenseName_oneTime
    const amount = category === 'fixed' ? expenseAmount_fixed : category === 'variable' ? expenseAmount_variable : expenseAmount_oneTime
    if (!name.trim() || !amount) return
    await supabase.from('salon_expenses').insert({ salon_id: salonId, category, name: name.trim(), amount, month: selectedMonth, year: selectedYear })
    if (category === 'fixed')    { setExpenseName_fixed('');    setExpenseAmount_fixed(0) }
    if (category === 'variable') { setExpenseName_variable(''); setExpenseAmount_variable(0) }
    if (category === 'one_time') { setExpenseName_oneTime('');  setExpenseAmount_oneTime(0) }
    fetchExpenses()
  }

  async function deleteExpense(id: string) {
    await supabase.from('salon_expenses').delete().eq('id', id)
    fetchExpenses()
  }

  useEffect(() => { fetchExpenses() }, [salonId, selectedMonth, selectedYear]) // eslint-disable-line react-hooks/exhaustive-deps

  const fixedRows    = expenses.filter(e => e.category === 'fixed')
  const variableRows = expenses.filter(e => e.category === 'variable')
  const oneTimeRows  = expenses.filter(e => e.category === 'one_time')
  const fixedTotal    = fixedRows.reduce((s, e) => s + e.amount, 0)
  const variableTotal = variableRows.reduce((s, e) => s + e.amount, 0)
  const oneTimeTotal  = oneTimeRows.reduce((s, e) => s + e.amount, 0)
  const grandTotal    = fixedTotal + variableTotal + oneTimeTotal

  const addBtn: React.CSSProperties = {
    fontSize: 12, padding: '7px 14px', borderRadius: 6, cursor: 'pointer',
    backgroundColor: 'transparent', border: '0.5px solid #034325', color: '#034325', flexShrink: 0,
  }
  const delBtn: React.CSSProperties = {
    fontSize: 11, padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
    backgroundColor: 'transparent', border: '0.5px solid #991b1b', color: '#991b1b', flexShrink: 0,
  }
  const selectSt: React.CSSProperties = {
    fontSize: 13, color: '#000', border: '0.5px solid #d1d5db',
    borderRadius: 6, padding: '8px 12px', backgroundColor: '#ffffff',
  }
  const numInput: React.CSSProperties = { ...inputStyle, width: 110, flexShrink: 0 }
  const cardWhite: React.CSSProperties = { backgroundColor: '#ffffff', border: '0.5px solid #e0e0e0', borderRadius: 8, padding: 16, marginBottom: 14 }

  function renderSubsection(
    label: string,
    category: 'fixed' | 'variable' | 'one_time',
    rows: { id: string; name: string; amount: number }[],
    name: string, amount: number,
    onName: (v: string) => void, onAmount: (v: number) => void,
    subtotal: number,
  ) {
    return (
      <div style={cardWhite}>
        <p style={labelStyle}>{label}</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input
            style={{ ...inputStyle, flex: 1 }}
            placeholder="Expense name"
            value={name}
            onChange={e => onName(e.target.value)}
          />
          <input
            style={numInput}
            type="number"
            placeholder="AED"
            value={amount || ''}
            onChange={e => onAmount(Number(e.target.value))}
          />
          <button style={addBtn} onClick={() => addExpense(category)}>Add</button>
        </div>
        {rows.length > 0 && (
          <>
            {rows.map(r => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '0.5px solid #f0f0f0' }}>
                <span style={{ fontSize: 13, color: '#111' }}>{r.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 13, color: '#034325', fontWeight: 500 }}>AED {r.amount.toLocaleString()}</span>
                  <button style={delBtn} onClick={() => deleteExpense(r.id)}>Delete</button>
                </div>
              </div>
            ))}
            <div style={{ textAlign: 'right', marginTop: 8 }}>
              <span style={{ fontSize: 12, color: '#6b7280' }}>Subtotal: </span>
              <span style={{ fontSize: 12, color: '#034325', fontWeight: 500 }}>AED {subtotal.toLocaleString()}</span>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div>
      <p style={{ fontSize: 16, fontWeight: 500, color: '#111', margin: '0 0 16px' }}>Expenses</p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} style={selectSt}>
          {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
        </select>
        <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} style={selectSt}>
          {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {expensesLoading ? (
        <p style={{ fontSize: 12, color: '#6b7280' }}>Loading...</p>
      ) : (
        <>
          {renderSubsection('Fixed Monthly',    'fixed',    fixedRows,    expenseName_fixed,    expenseAmount_fixed,    setExpenseName_fixed,    setExpenseAmount_fixed,    fixedTotal)}
          {renderSubsection('Variable Monthly', 'variable', variableRows, expenseName_variable, expenseAmount_variable, setExpenseName_variable, setExpenseAmount_variable, variableTotal)}
          {renderSubsection('One-Time',         'one_time', oneTimeRows,  expenseName_oneTime,  expenseAmount_oneTime,  setExpenseName_oneTime,  setExpenseAmount_oneTime,  oneTimeTotal)}
          <div style={{ textAlign: 'right', padding: '8px 0' }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Grand Total: </span>
            <span style={{ fontSize: 15, fontWeight: 500, color: '#034325' }}>AED {grandTotal.toLocaleString()}</span>
          </div>
        </>
      )}
    </div>
  )
}

// ── Section: Staff settings ───────────────────────────────────────────────────

function SectionStaffSettings({ config, salonId, onRefresh }: { config: ConfigData; salonId: string; onRefresh: () => void }) {
  const [c, setC] = useState(config)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  useEffect(() => { setC(config); setDirty(false) }, [config])
  function up<K extends keyof ConfigData>(k: K, v: ConfigData[K]) { setC(p => ({ ...p, [k]: v })); setDirty(true) }

  async function save() {
    setSaving(true)
    try {
      const { data, error } = await supabase.from('salon_config').update({
        staff_can_see_revenue: c.staff_can_see_revenue,
        staff_can_edit_appointments: c.staff_can_edit_appointments,
        technician_see_own_revenue: c.technician_see_own_revenue,
        technician_collect_payments: c.technician_collect_payments,
        supervisor_view_financials: c.supervisor_view_financials,
      }).eq('salon_id', salonId).select()
      console.log('[Admin] Staff settings save result:', { data, error })
      if (error) { console.error('[Admin] Staff settings save error:', error); setSaving(false); return }
      setSaving(false); setDirty(false); onRefresh()
    } catch (err) {
      console.error('[Admin] Staff settings save exception:', err)
      setSaving(false)
    }
  }

  return (
    <div>
      <p style={{ fontSize: 16, fontWeight: 500, color: '#111', margin: '0 0 16px' }}>Staff settings</p>
      <div style={cardStyle}>
        <p style={subHeading}>Supervisor permissions</p>
        <ToggleRow label="Can see today's revenue" on={c.staff_can_see_revenue} onChange={v => up('staff_can_see_revenue', v)} />
        <ToggleRow label="Can edit appointments" on={c.staff_can_edit_appointments} onChange={v => up('staff_can_edit_appointments', v)} />
        <ToggleRow label="Can view Finance Report and YTD Balance Sheet" sub="Enable when owner is unavailable" on={c.supervisor_view_financials} onChange={v => up('supervisor_view_financials', v)} />
      </div>
      <div style={cardStyle}>
        <p style={subHeading}>Technician permissions</p>
        <ToggleRow label="Can see own revenue only" on={c.technician_see_own_revenue} onChange={v => up('technician_see_own_revenue', v)} />
        <ToggleRow label="Can collect payments" on={c.technician_collect_payments} onChange={v => up('technician_collect_payments', v)} />
      </div>
      <SaveBar dirty={dirty} saving={saving} onSave={save} onCancel={() => { setC(config); setDirty(false) }} />
    </div>
  )
}

// ── Section: Run payroll ──────────────────────────────────────────────────────

interface PayrollStaffRow {
  id: string
  name: string
  role: string
  monthly_salary: number
  commission_pct: number
  services_revenue: number
  commission_earned: number
  gross: number
  advance_deductions: number
  net_payable: number
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

function SectionPayroll({ salonId }: { salonId: string }) {
  const now = new Date()
  const [selectedMonth,    setSelectedMonth]    = useState<number>(now.getMonth() + 1)
  const [selectedYear,     setSelectedYear]     = useState<number>(now.getFullYear())
  const [staffList,        setStaffList]        = useState<PayrollStaffRow[]>([])
  const [selectedStaffIds, setSelectedStaffIds] = useState<Set<string>>(new Set())
  const [loading,          setLoading]          = useState(true)
  const [running,          setRunning]          = useState(false)
  const [error,            setError]            = useState<string | null>(null)
  const [successMsg,       setSuccessMsg]       = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!salonId) { setLoading(false); return }
      setLoading(true); setError(null)
      try {
        const { data: staffData, error: staffErr } = await supabase
          .from('staff')
          .select('id, name, role, monthly_salary, commission_pct')
          .eq('salon_id', salonId)
          .eq('status', 'active')
          .neq('role', 'owner')
        if (staffErr) throw staffErr

        const periodStart = new Date(selectedYear, selectedMonth - 1, 1).toISOString()
        const periodEnd   = new Date(selectedYear, selectedMonth, 1).toISOString()

        const rows: PayrollStaffRow[] = await Promise.all((staffData ?? []).map(async s => {
          const sid     = s.id as string
          const monthly = (s.monthly_salary as number | null) ?? 0
          const pct     = (s.commission_pct as number | null) ?? 0

          const [{ data: apptData }, { data: advData }, { data: prodPayData }] = await Promise.all([
            supabase.from('appointments').select('id, payments(amount)').eq('salon_id', salonId).eq('staff_id', sid).eq('status', 'completed').gte('starts_at', periodStart).lt('starts_at', periodEnd),
            supabase.from('staff_advances').select('emi_amount').eq('staff_id', sid).eq('status', 'active'),
            supabase.from('payments').select('created_at').eq('salon_id', salonId).eq('staff_id', sid).eq('reference', 'product_sale').eq('status', 'completed').gte('created_at', periodStart).lt('created_at', periodEnd),
          ])

          const services_revenue   = (apptData ?? []).reduce((sum, a) => {
            const pays = (a.payments as unknown as { amount: number | null }[] | null) ?? []
            return sum + pays.reduce((s, p) => s + ((p.amount) ?? 0), 0)
          }, 0)
          const advance_deductions = (advData ?? []).reduce((sum, r) => sum + (((r as { emi_amount: number | null }).emi_amount) ?? 0), 0)

          // Product sale commission: match inventory_transactions by approximate timestamp (±60s)
          let productSaleCommission = 0
          if ((prodPayData ?? []).length > 0) {
            const { data: saleTx } = await supabase
              .from('inventory_transactions')
              .select('margin_retained, created_at, inventory_items(commission_pct)')
              .eq('salon_id', salonId)
              .eq('type', 'sale')
              .gte('created_at', periodStart)
              .lt('created_at', periodEnd)
            const payTimes = (prodPayData ?? []).map(p => new Date(p.created_at as string).getTime())
            for (const tx of saleTx ?? []) {
              const txTime = new Date(tx.created_at as string).getTime()
              if (payTimes.some(pt => Math.abs(txTime - pt) <= 60000)) {
                const marginRetained = (tx.margin_retained as number | null) ?? 0
                const commPct = (tx.inventory_items as unknown as { commission_pct: number | null } | null)?.commission_pct ?? 0
                productSaleCommission += marginRetained * commPct / 100
              }
            }
          }

          const commission_earned  = services_revenue * pct / 100 + productSaleCommission
          const gross              = monthly + commission_earned
          const net_payable        = gross - advance_deductions

          return {
            id:                 sid,
            name:               (s.name as string) ?? '',
            role:               (s.role as string) ?? '',
            monthly_salary:     monthly,
            commission_pct:     pct,
            services_revenue,
            commission_earned,
            gross,
            advance_deductions,
            net_payable,
          }
        }))

        if (cancelled) return
        setStaffList(rows)
        setSelectedStaffIds(new Set(rows.map(r => r.id)))
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load payroll data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [salonId, selectedMonth, selectedYear])

  function toggleStaff(id: string) {
    setSelectedStaffIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const allSelected  = staffList.length > 0 && selectedStaffIds.size === staffList.length
  const selectedRows = staffList.filter(r => selectedStaffIds.has(r.id))
  const totalNet     = selectedRows.reduce((s, r) => s + r.net_payable, 0)

  function toggleAll() {
    if (allSelected) setSelectedStaffIds(new Set())
    else             setSelectedStaffIds(new Set(staffList.map(r => r.id)))
  }

  async function runPayroll() {
    if (selectedStaffIds.size === 0 || !salonId) return
    setRunning(true); setError(null); setSuccessMsg(null)
    try {
      const rowsToInsert = selectedRows.map(r => ({
        salon_id:           salonId,
        staff_id:           r.id,
        period_month:       selectedMonth,
        period_year:        selectedYear,
        basic_salary:       r.monthly_salary,
        commission_earned:  r.commission_earned,
        advance_deductions: r.advance_deductions,
        net_payable:        r.net_payable,
        status:             'completed',
      }))
      const { error: insErr } = await supabase.from('payroll_runs').insert(rowsToInsert)
      if (insErr) throw insErr
      setSuccessMsg(`Payroll run complete for ${rowsToInsert.length} staff members.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run payroll')
    } finally {
      setRunning(false)
    }
  }

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]

  return (
    <div>
      <p style={{ fontSize: 16, fontWeight: 500, color: '#111', margin: '0 0 16px' }}>Run payroll cycle</p>

      <div style={cardStyle}>
        <p style={subHeading}>Pay period</p>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Month</label>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(parseInt(e.target.value, 10))}
              style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
            >
              {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Year</label>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(parseInt(e.target.value, 10))}
              style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <p style={{ ...subHeading, margin: 0 }}>Staff</p>
          <button
            onClick={toggleAll}
            style={{
              fontSize: 11, color: '#034325', backgroundColor: 'transparent',
              border: '0.5px solid #034325', borderRadius: 4, padding: '3px 10px', cursor: 'pointer',
            }}
          >{allSelected ? 'Deselect all' : 'Select all'}</button>
        </div>

        {loading ? (
          <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>Loading…</p>
        ) : staffList.length === 0 ? (
          <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>No active staff.</p>
        ) : (
          <>
            {(() => {
              const TH_PAYROLL: React.CSSProperties = { textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', padding: '8px 10px', borderBottom: '0.5px solid #e0e0e0' }
              const TD_PAYROLL: React.CSSProperties = { fontSize: 12, color: '#111', padding: '8px 10px', borderBottom: '0.5px solid #f0f0f0', verticalAlign: 'middle' }
              return (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ ...TH_PAYROLL, width: 28 }}></th>
                        <th style={TH_PAYROLL}>Staff</th>
                        <th style={{ ...TH_PAYROLL, textAlign: 'right' }}>Basic salary (AED)</th>
                        <th style={{ ...TH_PAYROLL, textAlign: 'right' }}>Commission earned (AED)</th>
                        <th style={{ ...TH_PAYROLL, textAlign: 'right' }}>Deductions (AED)</th>
                        <th style={{ ...TH_PAYROLL, textAlign: 'right' }}>Net payable (AED)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffList.map(r => {
                        const selected = selectedStaffIds.has(r.id)
                        const rowOpacity = selected ? 1 : 0.4
                        return (
                          <tr key={r.id} style={{ opacity: rowOpacity }}>
                            <td style={TD_PAYROLL}>
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => toggleStaff(r.id)}
                                style={{ accentColor: '#034325', width: 14, height: 14 }}
                              />
                            </td>
                            <td style={TD_PAYROLL}>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: 13, color: '#111' }}>{r.name}</span>
                                <span style={{ fontSize: 11, color: '#6b7280', textTransform: 'capitalize' }}>{r.role}</span>
                              </div>
                            </td>
                            <td style={{ ...TD_PAYROLL, textAlign: 'right' }}>{r.monthly_salary.toFixed(0)}</td>
                            <td style={{ ...TD_PAYROLL, textAlign: 'right' }}>{r.commission_earned.toFixed(0)}</td>
                            <td style={{ ...TD_PAYROLL, textAlign: 'right' }}>{r.advance_deductions.toFixed(0)}</td>
                            <td style={{ ...TD_PAYROLL, textAlign: 'right', fontWeight: 500 }}>{r.net_payable.toFixed(0)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            })()}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, marginTop: 6, borderTop: '0.5px solid #e0e0e0' }}>
              <span style={{ fontSize: 12, color: '#6b7280' }}>{selectedStaffIds.size} of {staffList.length} selected</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#034325' }}>Total: AED {totalNet.toFixed(0)}</span>
            </div>
          </>
        )}
      </div>

      <div style={{ backgroundColor: '#fff3cd', border: '0.5px solid #C9A227', borderRadius: 6, padding: '10px 14px', marginBottom: 14 }}>
        <p style={{ fontSize: 12, color: '#92400e', margin: 0 }}>
          Running payroll will record salary, commission and advance deductions for the selected staff for {MONTH_NAMES[selectedMonth - 1]} {selectedYear}. This action cannot be undone.
        </p>
      </div>

      {error && <p style={{ fontSize: 12, color: '#991b1b', margin: '0 0 10px' }}>{error}</p>}
      {successMsg && <p style={{ fontSize: 12, color: '#034325', margin: '0 0 10px' }}>{successMsg}</p>}

      <button
        onClick={runPayroll}
        disabled={selectedStaffIds.size === 0 || running}
        style={{
          backgroundColor: (selectedStaffIds.size === 0 || running) ? '#e0e0e0' : '#034325',
          color:           (selectedStaffIds.size === 0 || running) ? '#9ca3af' : '#ffffff',
          border: 'none', borderRadius: 6, padding: '10px 18px',
          fontSize: 13, fontWeight: 600,
          cursor: (selectedStaffIds.size === 0 || running) ? 'not-allowed' : 'pointer',
        }}
      >{running ? 'Running…' : `Run payroll for ${selectedStaffIds.size} staff`}</button>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Admin() {
  const staffRecord = useAuthStore(s => s.staffRecord)
  const setSalonName = useAuthStore(s => s.setSalonName)
  const salonId = staffRecord?.salon_id ?? ''
  const isMobile = useIsMobile()

  const [activeSection, setActiveSection] = useState<Section>('Salon details')
  const [salon,    setSalon]    = useState<SalonData>(defaultSalon)
  const [config,   setConfig]   = useState<ConfigData>(defaultConfig)
  const [services, setServices] = useState<ServiceRow[]>([])
  const [loading,  setLoading]  = useState(true)

  const fetchAll = useCallback(async () => {
    if (!salonId) { setLoading(false); return }
    const [{ data: salonData }, { data: configData }] = await Promise.all([
      supabase.from('salons').select('id,name,address_line1,address_line2,city,country,phone,email,service_pricing_mode').eq('id', salonId).single(),
      supabase.from('salon_config').select('*').eq('salon_id', salonId).single(),
    ])
    if (salonData) setSalon({
      id:                   salonData.id               as string,
      name:                 (salonData.name            as string) ?? '',
      address_line1:        (salonData.address_line1   as string) ?? '',
      address_line2:        (salonData.address_line2   as string) ?? '',
      city:                 (salonData.city            as string) ?? 'Dubai',
      country:              (salonData.country         as string) ?? 'United Arab Emirates',
      phone:                (salonData.phone           as string) ?? '',
      email:                (salonData.email           as string) ?? '',
      service_pricing_mode: (salonData.service_pricing_mode as string) ?? 'manual',
    })
    if (configData) setConfig({ ...defaultConfig, ...configData, id: configData.id as string })
    setLoading(false)
  }, [salonId])

  useEffect(() => { fetchAll() }, [fetchAll])

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      <Topbar />
      <div style={{ marginTop: 52, padding: '40px 0', textAlign: 'center' }}>
        <p style={{ fontSize: 12, color: '#6b7280' }}>Loading…</p>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', display: 'flex', flexDirection: 'column', overflowX: 'hidden' }}>
      <Topbar />
      <div style={{ marginTop: 52, flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row' }}>

        {/* Mobile tab strip */}
        {isMobile && (
          <div style={{ display: 'flex', overflowX: 'auto', whiteSpace: 'nowrap', borderBottom: '0.5px solid #e0e0e0', backgroundColor: '#ffffff', flexShrink: 0 }}>
            {SECTIONS.map(s => {
              const active = s === activeSection
              return (
                <div
                  key={s}
                  onClick={() => setActiveSection(s)}
                  style={{
                    padding: '11px 14px', fontSize: 12, whiteSpace: 'nowrap', cursor: 'pointer',
                    color: active ? '#034325' : '#888888',
                    fontWeight: active ? 500 : 400,
                    borderBottom: active ? '2px solid #034325' : '2px solid transparent',
                  }}
                >{s}</div>
              )
            })}
          </div>
        )}

        {/* Sidebar */}
        {!isMobile && (
          <div style={{ width: 200, flexShrink: 0, backgroundColor: '#ffffff', borderRight: '0.5px solid #e0e0e0', paddingTop: 12 }}>
            {SECTIONS.map(s => {
              const active = s === activeSection
              return (
                <div
                  key={s}
                  onClick={() => setActiveSection(s)}
                  style={{
                    padding: '10px 16px', cursor: 'pointer', fontSize: 13,
                    borderLeft: active ? '3px solid #034325' : '3px solid transparent',
                    backgroundColor: active ? '#f0fdf4' : 'transparent',
                    color: active ? '#034325' : '#6b7280',
                    fontWeight: active ? 500 : 400,
                  }}
                >{s}</div>
              )
            })}
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, padding: isMobile ? '16px 14px' : '24px 28px', overflowY: 'auto' }}>
          {activeSection === 'Salon details'   && <SectionSalon salon={salon} config={config} salonId={salonId} onRefresh={fetchAll} onNameSaved={setSalonName} />}
          {activeSection === 'Services'        && <SectionServices salonId={salonId} />}
          {activeSection === 'Payments'        && <SectionPayments config={config} salonId={salonId} onRefresh={fetchAll} />}
          {activeSection === 'WhatsApp'        && <SectionWhatsApp config={config} salonId={salonId} onRefresh={fetchAll} />}
          {activeSection === 'Loyalty points'  && <SectionLoyalty config={config} salonId={salonId} onRefresh={fetchAll} />}
          {activeSection === 'Noorie AI'       && <SectionAI config={config} salonId={salonId} salon={{ name: salon.name, city: salon.city, country: salon.country }} onRefresh={fetchAll} />}
          {activeSection === 'Inventory'       && <SectionInventory salonId={salonId} />}
          {activeSection === 'Expenses'        && <SectionExpenses salonId={salonId} />}
          {activeSection === 'Staff settings'  && <SectionStaffSettings config={config} salonId={salonId} onRefresh={fetchAll} />}
          {activeSection === 'Run payroll'     && <SectionPayroll salonId={salonId} />}
        </div>
      </div>

      <div style={{ textAlign: 'center', padding: '10px 0 14px' }}>
        <p style={{ color: '#9ca3af', fontSize: 10, margin: 0 }}>Powered by Blue Flute Consulting LLC-FZ</p>
      </div>
    </div>
  )
}
