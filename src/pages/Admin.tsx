import { useState, useEffect, useCallback } from 'react'
import Topbar from '../components/Topbar'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

// ── Constants ─────────────────────────────────────────────────────────────────

const SECTIONS = [
  'Salon details', 'Services', 'Payments', 'WhatsApp',
  'Loyalty points', 'Noorie AI', 'Staff settings',
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
}

interface ServiceRow { id: string; name: string; duration_minutes: number; active: boolean }

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
  const [c, setC] = useState({ payroll_mode: config.payroll_mode, payroll_mode_cycle: config.payroll_mode_cycle })
  const [committed, setCommitted] = useState(salon)
  const [committedH, setCommittedH] = useState<OperatingHours>(config.operating_hours ?? defaultHours)
  const [committedC, setCommittedC] = useState({ payroll_mode: config.payroll_mode, payroll_mode_cycle: config.payroll_mode_cycle })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [openInfo, setOpenInfo] = useState(true)
  const [openHours, setOpenHours] = useState(false)
  const [openPayroll, setOpenPayroll] = useState(false)

  useEffect(() => {
    setS(salon); setCommitted(salon)
    setHours(config.operating_hours ?? defaultHours); setCommittedH(config.operating_hours ?? defaultHours)
    const p = { payroll_mode: config.payroll_mode, payroll_mode_cycle: config.payroll_mode_cycle }
    setC(p); setCommittedC(p)
  }, [salon, config])

  function upS(k: keyof SalonData, v: string) { setS(p => ({ ...p, [k]: v })) }
  function upH(day: Day, k: keyof DayConfig, v: string | boolean) {
    setHours(p => ({ ...p, [day]: { ...p[day], [k]: v } }))
  }
  function upC(k: keyof typeof c, v: string) { setC(p => ({ ...p, [k]: v })) }

  const dirty = JSON.stringify(s) !== JSON.stringify(committed) || JSON.stringify(hours) !== JSON.stringify(committedH) || JSON.stringify(c) !== JSON.stringify(committedC)

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
        payroll_mode: c.payroll_mode, payroll_mode_cycle: c.payroll_mode_cycle,
      }).eq('salon_id', salonId).select()
      console.log('[Admin] Salon salon_config update:', { data: d2, error: e2 })
      if (e2) { setError(e2.message); setSaving(false); return }
      setCommitted(s); setCommittedH(hours); setCommittedC(c)
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
              <select value={s.country} onChange={e => { upS('country', e.target.value); upS('city', '') }} style={{ ...fieldStyle, appearance: 'none', cursor: 'pointer' }}>
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
                <input value={s.phone} onChange={e => upS('phone', e.target.value)} style={fieldStyle} type="tel" placeholder="+971 50 000 0000" />
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
                  <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 12, color: '#374151', width: 90, textTransform: 'capitalize', flexShrink: 0 }}>{day}</span>
                    <input
                      type="checkbox" checked={d.open}
                      onChange={e => upH(day, 'open', e.target.checked)}
                      style={{ accentColor: '#034325', width: 15, height: 15, flexShrink: 0, cursor: 'pointer' }}
                    />
                    {d.open ? (
                      <>
                        <input type="time" value={d.from} onChange={e => upH(day, 'from', e.target.value)}
                          style={{ ...fieldStyle, width: 110 }} />
                        <span style={{ fontSize: 12, color: '#6b7280', flexShrink: 0 }}>to</span>
                        <input type="time" value={d.to} onChange={e => upH(day, 'to', e.target.value)}
                          style={{ ...fieldStyle, width: 110 }} />
                      </>
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
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
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
              <div style={{ borderLeft: '0.5px solid #e0e0e0', paddingLeft: 32, flexShrink: 0 }}>
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
      <SaveBar dirty={dirty} saving={saving} onSave={save} onCancel={() => { setS(committed); setHours(committedH); setC(committedC) }} />
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
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteBlocked, setDeleteBlocked] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDur, setNewDur] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const { data } = await supabase.from('services').select('id, name, duration_minutes, is_active').eq('salon_id', salonId).order('name')
    setServices((data ?? []).map(s => ({ id: s.id as string, name: s.name as string, duration_minutes: (s.duration_minutes as number) ?? 0, active: (s.is_active as boolean) ?? true })))
    setLoading(false)
  }
  useEffect(() => { load() }, [salonId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveEdit(id: string) {
    try {
      const { data, error } = await supabase.from('services').update({ name: editName.trim(), duration_minutes: parseInt(editDur) }).eq('id', id).select()
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

  async function addService() {
    if (!newName.trim() || !newDur.trim()) return
    setAdding(true)
    try {
      const { error } = await supabase.from('services').insert({ salon_id: salonId, name: newName.trim(), duration_minutes: parseInt(newDur), price: 0, is_active: true })
      if (error) { console.error('[Admin] Services addService error:', error); setError(error.message); setAdding(false); return }
      setNewName(''); setNewDur(''); setAdding(false); load()
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

      <div style={{ backgroundColor: '#ffffff', border: '0.5px solid #e0e0e0', borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
        {loading ? <p style={{ padding: 24, textAlign: 'center', fontSize: 12, color: '#6b7280', margin: 0 }}>Loading…</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={TH}>Service</th><th style={TH}>Duration</th><th style={TH}>Status</th><th style={TH}>Actions</th></tr></thead>
            <tbody>
              {services.map(svc => (
                <tr key={svc.id} style={{ opacity: svc.active ? 1 : 0.5 }}>
                  <td style={TD}>
                    {editId === svc.id
                      ? <input value={editName} onChange={e => setEditName(e.target.value)} style={{ ...inputStyle, width: 180 }} autoFocus />
                      : svc.name}
                  </td>
                  <td style={TD}>
                    {editId === svc.id
                      ? <input value={editDur} onChange={e => setEditDur(e.target.value)} type="number" style={{ ...inputStyle, width: 80 }} />
                      : `${svc.duration_minutes} min`}
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
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => { console.log('Edit clicked:', svc.id); setEditId(svc.id); setEditName(svc.name); setEditDur(String(svc.duration_minutes)) }} style={{ fontSize: 11, border: '0.5px solid #034325', color: '#034325', backgroundColor: 'transparent', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>Edit</button>
                        <button onClick={() => { console.log('Suspend clicked:', svc.id); toggleActive(svc.id, svc.active) }} style={{ fontSize: 11, border: `0.5px solid ${svc.active ? '#6b7280' : '#034325'}`, color: svc.active ? '#6b7280' : '#034325', backgroundColor: 'transparent', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>{svc.active ? 'Suspend' : 'Resume'}</button>
                        <button onClick={() => { setDeleteId(svc.id); setDeleteBlocked(false); setError(null) }} style={{ fontSize: 11, border: '0.5px solid #991b1b', color: '#991b1b', backgroundColor: 'transparent', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>Delete</button>
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

      <div style={cardStyle}>
        <p style={subHeading}>Add new service</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div style={{ flex: 2 }}><label style={labelStyle}>Service name</label><input value={newName} onChange={e => setNewName(e.target.value)} style={inputStyle} placeholder="Service name" /></div>
          <div style={{ flex: 1 }}><label style={labelStyle}>Duration (min)</label><input value={newDur} onChange={e => setNewDur(e.target.value)} type="number" style={inputStyle} placeholder="60" /></div>
          <button onClick={addService} disabled={adding || !newName.trim() || !newDur.trim()} style={{ backgroundColor: !newName.trim() || !newDur.trim() ? '#e0e0e0' : '#034325', color: !newName.trim() || !newDur.trim() ? '#9ca3af' : '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 12, fontWeight: 500, cursor: !newName.trim() || !newDur.trim() ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
            {adding ? '…' : '+ Add'}
          </button>
        </div>
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
            <ToggleRow label="Appointment reminder" on={c.whatsapp_reminder} onChange={v => up('whatsapp_reminder', v)} />
            <select value={c.whatsapp_reminder_hours} onChange={e => up('whatsapp_reminder_hours', e.target.value)} style={{ ...inputStyle, width: 80, marginLeft: 12 }}>
              <option value="24">24h</option><option value="12">12h</option><option value="2">2h</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
            <ToggleRow label="Birthday greeting" on={c.whatsapp_birthday} onChange={v => up('whatsapp_birthday', v)} />
            <select value={c.whatsapp_birthday_timing} onChange={e => up('whatsapp_birthday_timing', e.target.value)} style={{ ...inputStyle, width: 130, marginLeft: 12 }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span style={{ color: '#6b7280' }}>Client earns</span>
              <input type="number" value={c.loyalty_earning_rate} onChange={e => up('loyalty_earning_rate', parseFloat(e.target.value) || 0)} style={{ ...inputStyle, width: 70 }} />
              <span style={{ color: '#6b7280' }}>point per</span>
              <input type="number" value={c.loyalty_redemption_rate} onChange={e => up('loyalty_redemption_rate', parseFloat(e.target.value) || 0)} style={{ ...inputStyle, width: 70 }} />
              <span style={{ color: '#6b7280' }}>AED spent</span>
            </div>
          </div>
          <div>
            <label style={labelStyle}>Redemption rate</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
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

// ── Section: Noorie AI ────────────────────────────────────────────────────────

function SectionAI({ config, salonId, onRefresh }: { config: ConfigData; salonId: string; onRefresh: () => void }) {
  const [c, setC] = useState(config)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  useEffect(() => { setC(config); setDirty(false) }, [config])
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

  return (
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
            onClick={() => console.log('Competitor intelligence: run now triggered')}
            style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#ffffff', border: '0.5px solid rgba(255,255,255,0.3)', borderRadius: 6, padding: '5px 14px', fontSize: 12, cursor: 'pointer' }}
          >Run now</button>
          {c.competitor_last_scan && (
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Last scan: {new Date(c.competitor_last_scan).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          )}
        </div>
      </div>

      <SaveBar dirty={dirty} saving={saving} onSave={save} onCancel={() => { setC(config); setDirty(false) }} />
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Admin() {
  const staffRecord = useAuthStore(s => s.staffRecord)
  const setSalonName = useAuthStore(s => s.setSalonName)
  const salonId = staffRecord?.salon_id ?? ''

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
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', display: 'flex', flexDirection: 'column' }}>
      <Topbar />
      <div style={{ marginTop: 52, flex: 1, display: 'flex' }}>

        {/* Sidebar */}
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

        {/* Content */}
        <div style={{ flex: 1, padding: '24px 28px', overflowY: 'auto' }}>
          {activeSection === 'Salon details'   && <SectionSalon salon={salon} config={config} salonId={salonId} onRefresh={fetchAll} onNameSaved={setSalonName} />}
          {activeSection === 'Services'        && <SectionServices salonId={salonId} />}
          {activeSection === 'Payments'        && <SectionPayments config={config} salonId={salonId} onRefresh={fetchAll} />}
          {activeSection === 'WhatsApp'        && <SectionWhatsApp config={config} salonId={salonId} onRefresh={fetchAll} />}
          {activeSection === 'Loyalty points'  && <SectionLoyalty config={config} salonId={salonId} onRefresh={fetchAll} />}
          {activeSection === 'Noorie AI'       && <SectionAI config={config} salonId={salonId} onRefresh={fetchAll} />}
          {activeSection === 'Staff settings'  && <SectionStaffSettings config={config} salonId={salonId} onRefresh={fetchAll} />}
        </div>
      </div>

      <div style={{ textAlign: 'center', padding: '10px 0 14px' }}>
        <p style={{ color: '#9ca3af', fontSize: 10, margin: 0 }}>Powered by Blue Flute Consulting LLC-FZ</p>
      </div>
    </div>
  )
}
