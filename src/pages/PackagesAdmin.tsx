import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../hooks/useIsMobile'

interface Package {
  id: string; name: string; valid_from: string; valid_to: string;
  price_package: number; price_normal: number; is_active: boolean;
}
interface PackageService {
  id: string; service_id: string; name: string; price: number; sort_order: number;
}
interface ServiceOption { id: string; name: string; price: number; }

const labelStyle: React.CSSProperties = {
  fontSize: 11, color: '#6b7280', fontWeight: 500, display: 'block', marginBottom: 4,
}
const inputStyle: React.CSSProperties = {
  width: '100%', border: '0.5px solid #e0e0e0', borderRadius: 6, padding: '7px 10px',
  fontSize: 13, outline: 'none', boxSizing: 'border-box', color: '#111',
}

export default function PackagesAdmin({ salonId }: { salonId: string }) {
  const isMobile = useIsMobile()
  const [packages, setPackages] = useState<Package[]>([])
  const [services, setServices] = useState<ServiceOption[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', valid_from: '', valid_to: '', price_package: '' })
  const [formServices, setFormServices] = useState<PackageService[]>([])
  const [addSvcId, setAddSvcId] = useState('')
  const [saving, setSaving] = useState(false)

  async function loadAll() {
    const [pkgRes, svcRes] = await Promise.all([
      supabase.from('packages').select('*').eq('salon_id', salonId).order('created_at', { ascending: false }),
      supabase.from('services').select('id, name, price').eq('salon_id', salonId).eq('is_active', true).order('name', { ascending: true }),
    ])
    setPackages((pkgRes.data ?? []) as Package[])
    setServices((svcRes.data ?? []) as ServiceOption[])
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [salonId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!editingId || editingId === 'new') return
    const pkg = packages.find(p => p.id === editingId)
    if (pkg) {
      setForm({
        name: pkg.name,
        valid_from: pkg.valid_from ?? '',
        valid_to: pkg.valid_to ?? '',
        price_package: String(pkg.price_package),
      })
    }
    async function loadPkgServices() {
      const { data } = await supabase
        .from('package_services')
        .select('id, service_id, price, sort_order, services(name)')
        .eq('package_id', editingId)
        .order('sort_order', { ascending: true })
      if (!data) return
      setFormServices((data as unknown as { id: string; service_id: string; price: number; sort_order: number; services: { name: string } | null }[]).map(r => ({
        id: r.id,
        service_id: r.service_id,
        name: r.services?.name ?? '—',
        price: r.price,
        sort_order: r.sort_order,
      })))
    }
    loadPkgServices()
  }, [editingId]) // eslint-disable-line react-hooks/exhaustive-deps

  const priceNormal = formServices.reduce((s, r) => s + r.price, 0)

  async function handleSave() {
    setSaving(true)
    let pkgId = editingId === 'new' ? null : editingId
    const priceNormalVal = Math.round(priceNormal * 100) / 100
    const pricePackageVal = parseFloat(form.price_package) || 0

    if (editingId === 'new') {
      const { data } = await supabase.from('packages').insert({
        salon_id: salonId,
        name: form.name.trim(),
        valid_from: form.valid_from || null,
        valid_to: form.valid_to || null,
        price_package: pricePackageVal,
        price_normal: priceNormalVal,
        is_active: true,
      }).select('id').single()
      pkgId = (data as { id: string } | null)?.id ?? null
    } else {
      await supabase.from('packages').update({
        name: form.name.trim(),
        valid_from: form.valid_from || null,
        valid_to: form.valid_to || null,
        price_package: pricePackageVal,
        price_normal: priceNormalVal,
      }).eq('id', pkgId!)
    }

    if (pkgId) {
      await supabase.from('package_services').delete().eq('package_id', pkgId)
      for (let i = 0; i < formServices.length; i++) {
        const svc = formServices[i]
        await supabase.from('package_services').insert({
          salon_id: salonId,
          package_id: pkgId,
          service_id: svc.service_id,
          price: svc.price,
          sort_order: i,
        })
      }
    }

    await loadAll()
    setEditingId(null)
    setSaving(false)
  }

  async function handleToggleActive(pkg: Package) {
    await supabase.from('packages').update({ is_active: !pkg.is_active }).eq('id', pkg.id)
    await loadAll()
  }

  async function handleDelete(id: string) {
    await supabase.from('packages').delete().eq('id', id)
    await loadAll()
  }

  function handleAddService() {
    const svc = services.find(s => s.id === addSvcId)
    if (!svc) return
    if (formServices.some(fs => fs.service_id === svc.id)) return
    setFormServices(prev => [...prev, {
      id: `temp_${svc.id}`,
      service_id: svc.id,
      name: svc.name,
      price: svc.price,
      sort_order: prev.length,
    }])
    setAddSvcId('')
  }

  function handleRemoveService(id: string) {
    setFormServices(prev => prev.filter(fs => fs.id !== id))
  }

  function handleServicePriceChange(id: string, price: string) {
    setFormServices(prev => prev.map(fs => fs.id === id ? { ...fs, price: parseFloat(price) || 0 } : fs))
  }

  const availableToAdd = services.filter(s => !formServices.some(fs => fs.service_id === s.id))

  if (loading) return <p style={{ fontSize: 12, color: '#6b7280', margin: '16px 0' }}>Loading...</p>

  return (
    <div>
      {/* Section heading */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: '#034325', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>Packages</p>
        <button
          onClick={() => { setEditingId('new'); setForm({ name: '', valid_from: '', valid_to: '', price_package: '' }); setFormServices([]) }}
          style={{ backgroundColor: '#034325', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
        >+ New package</button>
      </div>

      {/* Form */}
      {editingId !== null && (
        <div style={{ backgroundColor: '#fff', border: '0.5px solid #1D558F', borderRadius: 10, padding: 18, marginBottom: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Name</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} placeholder="Package name" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Valid from</label>
              <input type="date" value={form.valid_from} onChange={e => setForm(f => ({ ...f, valid_from: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Valid to</label>
              <input type="date" value={form.valid_to} onChange={e => setForm(f => ({ ...f, valid_to: e.target.value }))} style={inputStyle} />
            </div>
          </div>

          {/* Services heading */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Services</span>
            <span style={{ fontSize: 11, color: '#6b7280' }}>Price in package</span>
          </div>

          {/* Service rows */}
          {formServices.map(fs => (
            <div key={fs.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '0.5px solid #f0f0f0' }}>
              <span style={{ flex: 1, fontSize: 13, color: '#111' }}>{fs.name}</span>
              <div style={{ display: 'flex', alignItems: 'center', border: '0.5px solid #1D558F', borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
                <input
                  type="number"
                  value={fs.price}
                  onChange={e => handleServicePriceChange(fs.id, e.target.value)}
                  style={{ width: 56, border: 'none', padding: '5px 6px', fontSize: 13, fontWeight: 500, color: '#034325', outline: 'none', background: '#fff' }}
                />
                <span style={{ fontSize: 11, color: '#9ca3af', paddingRight: 6 }}>AED</span>
              </div>
              <button onClick={() => handleRemoveService(fs.id)} style={{ fontSize: 11, color: '#991b1b', border: 'none', background: 'none', cursor: 'pointer', padding: '4px 6px' }}>Remove</button>
            </div>
          ))}

          {/* Add service row */}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, marginBottom: 14 }}>
            <select
              value={addSvcId}
              onChange={e => setAddSvcId(e.target.value)}
              style={{ flex: 1, border: '0.5px solid #e0e0e0', borderRadius: 6, padding: '7px 8px', fontSize: 12, color: addSvcId ? '#111' : '#9ca3af', outline: 'none' }}
            >
              <option value="">Add a service...</option>
              {availableToAdd.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button
              onClick={handleAddService}
              disabled={!addSvcId}
              style={{ backgroundColor: addSvcId ? '#034325' : '#e0e0e0', color: addSvcId ? '#fff' : '#9ca3af', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 12, cursor: addSvcId ? 'pointer' : 'not-allowed' }}
            >Add</button>
          </div>

          {/* Price summary + actions */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', paddingTop: 10, borderTop: '0.5px solid #e0e0e0' }}>
            <span style={{ fontSize: 12, color: '#9ca3af', textDecoration: 'line-through', flexShrink: 0 }}>AED {priceNormal.toFixed(2)}</span>
            <div style={{ display: 'flex', alignItems: 'center', border: '0.5px solid #1D558F', borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
              <input
                type="number"
                value={form.price_package}
                onChange={e => setForm(f => ({ ...f, price_package: e.target.value }))}
                placeholder="0.00"
                style={{ width: 72, border: 'none', padding: '5px 6px', fontSize: 13, fontWeight: 500, color: '#034325', outline: 'none', background: '#fff' }}
              />
              <span style={{ fontSize: 11, color: '#9ca3af', paddingRight: 6 }}>AED</span>
            </div>
            <button
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
              style={{ backgroundColor: saving || !form.name.trim() ? '#e0e0e0' : '#034325', color: saving || !form.name.trim() ? '#9ca3af' : '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 500, cursor: saving || !form.name.trim() ? 'not-allowed' : 'pointer' }}
            >{saving ? 'Saving…' : 'Save'}</button>
            <button
              onClick={() => setEditingId(null)}
              style={{ backgroundColor: 'transparent', color: '#034325', border: '0.5px solid #034325', borderRadius: 6, padding: '7px 14px', fontSize: 12, cursor: 'pointer' }}
            >Cancel</button>
          </div>
        </div>
      )}

      {/* Package list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {packages.length === 0 && <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>No packages yet.</p>}
        {packages.map(pkg => (
          <div key={pkg.id} style={{ backgroundColor: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 500, color: '#111', margin: '0 0 3px' }}>{pkg.name}</p>
              <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>
                {pkg.price_normal > 0 && (
                  <span style={{ textDecoration: 'line-through', marginRight: 4 }}>AED {pkg.price_normal.toFixed(2)}</span>
                )}
                AED {pkg.price_package.toFixed(2)} · {pkg.valid_from ?? '—'} to {pkg.valid_to ?? '—'}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <button
                onClick={() => setEditingId(pkg.id)}
                style={{ fontSize: 11, border: '0.5px solid #034325', color: '#034325', backgroundColor: 'transparent', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}
              >Edit</button>
              <div
                onClick={() => handleToggleActive(pkg)}
                style={{ width: 36, height: 20, background: pkg.is_active ? '#034325' : '#ccc', borderRadius: 10, position: 'relative', cursor: 'pointer', flexShrink: 0 }}
              >
                <div style={{ position: 'absolute', top: 2, left: pkg.is_active ? 18 : 2, width: 16, height: 16, background: '#fff', borderRadius: '50%', transition: 'left 0.15s' }} />
              </div>
              <button
                onClick={() => handleDelete(pkg.id)}
                style={{ fontSize: 11, color: '#991b1b', border: 'none', background: 'none', cursor: 'pointer', padding: '3px 6px' }}
              >Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
