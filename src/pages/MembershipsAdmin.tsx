import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../hooks/useIsMobile'

interface Membership {
  id: string; name: string; service_id: string; price: number;
  validity_days: number; is_active: boolean;
}
interface ServiceOption { id: string; name: string; price: number; }

const labelStyle: React.CSSProperties = {
  fontSize: 11, color: '#6b7280', fontWeight: 500, display: 'block', marginBottom: 4,
}
const inputStyle: React.CSSProperties = {
  width: '100%', border: '0.5px solid #e0e0e0', borderRadius: 6, padding: '7px 10px',
  fontSize: 13, outline: 'none', boxSizing: 'border-box', color: '#111',
}

export default function MembershipsAdmin({ salonId }: { salonId: string }) {
  const isMobile = useIsMobile()
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [services, setServices] = useState<ServiceOption[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', service_id: '', price: '', validity_days: '30' })
  const [saving, setSaving] = useState(false)

  async function loadAll() {
    const [memRes, svcRes] = await Promise.all([
      supabase.from('memberships').select('*').eq('salon_id', salonId).order('created_at', { ascending: false }),
      supabase.from('services').select('id, name, price').eq('salon_id', salonId).eq('is_active', true).order('name', { ascending: true }),
    ])
    setMemberships((memRes.data ?? []) as Membership[])
    setServices((svcRes.data ?? []) as ServiceOption[])
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [salonId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!editingId || editingId === 'new') return
    const mem = memberships.find(m => m.id === editingId)
    if (mem) {
      setForm({
        name: mem.name,
        service_id: mem.service_id ?? '',
        price: String(mem.price),
        validity_days: String(mem.validity_days ?? 30),
      })
    }
  }, [editingId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    setSaving(true)
    const priceVal = parseFloat(form.price) || 0
    const validityVal = parseInt(form.validity_days, 10) || 30

    if (editingId === 'new') {
      await supabase.from('memberships').insert({
        salon_id: salonId,
        name: form.name.trim(),
        service_id: form.service_id,
        price: priceVal,
        validity_days: validityVal,
        is_active: true,
      })
    } else {
      await supabase.from('memberships').update({
        name: form.name.trim(),
        service_id: form.service_id,
        price: priceVal,
        validity_days: validityVal,
      }).eq('id', editingId!)
    }

    await loadAll()
    setEditingId(null)
    setSaving(false)
  }

  async function handleToggleActive(mem: Membership) {
    await supabase.from('memberships').update({ is_active: !mem.is_active }).eq('id', mem.id)
    await loadAll()
  }

  async function handleDelete(id: string) {
    await supabase.from('memberships').delete().eq('id', id)
    await loadAll()
  }

  const serviceName = (id: string) => services.find(s => s.id === id)?.name ?? '—'
  const canSave = form.name.trim() !== '' && form.service_id !== ''

  if (loading) return <p style={{ fontSize: 12, color: '#6b7280', margin: '16px 0' }}>Loading...</p>

  return (
    <div>
      {/* Section heading */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: '#034325', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>Memberships</p>
        <button
          onClick={() => { setEditingId('new'); setForm({ name: '', service_id: '', price: '', validity_days: '30' }) }}
          style={{ backgroundColor: '#034325', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
        >+ New membership</button>
      </div>

      {/* Form */}
      {editingId !== null && (
        <div style={{ backgroundColor: '#fff', border: '0.5px solid #1D558F', borderRadius: 10, padding: 18, marginBottom: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Name</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} placeholder="Membership name" />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Service (unlimited use)</label>
            <select
              value={form.service_id}
              onChange={e => setForm(f => ({ ...f, service_id: e.target.value }))}
              style={{ ...inputStyle, color: form.service_id ? '#111' : '#9ca3af' }}
            >
              <option value="">Select a service...</option>
              {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Price (AED)</label>
              <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} style={inputStyle} placeholder="0.00" />
            </div>
            <div>
              <label style={labelStyle}>Validity (days)</label>
              <input type="number" value={form.validity_days} onChange={e => setForm(f => ({ ...f, validity_days: e.target.value }))} style={inputStyle} placeholder="30" />
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', paddingTop: 10, borderTop: '0.5px solid #e0e0e0' }}>
            <button
              onClick={handleSave}
              disabled={saving || !canSave}
              style={{ backgroundColor: saving || !canSave ? '#e0e0e0' : '#034325', color: saving || !canSave ? '#9ca3af' : '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 500, cursor: saving || !canSave ? 'not-allowed' : 'pointer' }}
            >{saving ? 'Saving…' : 'Save'}</button>
            <button
              onClick={() => setEditingId(null)}
              style={{ backgroundColor: 'transparent', color: '#034325', border: '0.5px solid #034325', borderRadius: 6, padding: '7px 14px', fontSize: 12, cursor: 'pointer' }}
            >Cancel</button>
          </div>
        </div>
      )}

      {/* Membership list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {memberships.length === 0 && <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>No memberships yet.</p>}
        {memberships.map(mem => (
          <div key={mem.id} style={{ backgroundColor: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 500, color: '#111', margin: '0 0 3px' }}>{mem.name}</p>
              <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>
                AED {mem.price.toFixed(2)} · Unlimited {serviceName(mem.service_id)} · {mem.validity_days} days
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <button
                onClick={() => setEditingId(mem.id)}
                style={{ fontSize: 11, border: '0.5px solid #034325', color: '#034325', backgroundColor: 'transparent', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}
              >Edit</button>
              <div
                onClick={() => handleToggleActive(mem)}
                style={{ width: 36, height: 20, background: mem.is_active ? '#034325' : '#ccc', borderRadius: 10, position: 'relative', cursor: 'pointer', flexShrink: 0 }}
              >
                <div style={{ position: 'absolute', top: 2, left: mem.is_active ? 18 : 2, width: 16, height: 16, background: '#fff', borderRadius: '50%', transition: 'left 0.15s' }} />
              </div>
              <button
                onClick={() => handleDelete(mem.id)}
                style={{ fontSize: 11, color: '#991b1b', border: 'none', background: 'none', cursor: 'pointer', padding: '3px 6px' }}
              >Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
