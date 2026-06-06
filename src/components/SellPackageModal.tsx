import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

interface PackageOption {
  id: string
  name: string
  price: number
  validity_days: number | null
  serviceCount: number
  firstServiceId: string | null
}
interface MembershipOption {
  id: string
  name: string
  price: number
  validity_days: number
  serviceId: string
}
interface StaffOption { id: string; name: string }

interface Props {
  salonId: string
  clientId: string
  clientName: string
  onClose: () => void
  onDone: () => void
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.04em',
  display: 'block', marginBottom: 5,
}
const selectStyle: React.CSSProperties = {
  width: '100%', fontSize: 13, color: '#111',
  border: '0.5px solid #e0e0e0', borderRadius: 6,
  padding: '8px 10px', outline: 'none',
  backgroundColor: '#ffffff', boxSizing: 'border-box',
}

// Mirrors AppointmentDetail.creditLoyaltyPoints (earning only, no app-booking bonus).
async function earnLoyaltyPoints(clientId: string, salonId: string, appointmentId: string, amountPaid: number) {
  const { data: cfg } = await supabase
    .from('loyalty_config')
    .select('*')
    .eq('salon_id', salonId)
    .eq('is_active', true)
    .maybeSingle()
  if (!cfg) return

  const { data: client } = await supabase
    .from('clients')
    .select('loyalty_points')
    .eq('id', clientId)
    .single()
  if (!client) return

  const currentPoints = (client.loyalty_points as number) || 0
  const proThreshold = cfg.pro_threshold as number
  const maxThreshold = cfg.max_threshold as number
  const tier = currentPoints >= maxThreshold ? 'max' : currentPoints >= proThreshold ? 'pro' : 'regular'
  const pct = tier === 'max' ? (cfg.max_service_pct as number)
    : tier === 'pro' ? (cfg.pro_service_pct as number)
    : (cfg.regular_service_pct as number)

  const earnedPoints = Math.round((amountPaid * pct / 100) * 100) / 100
  if (earnedPoints <= 0) return

  await supabase.from('loyalty_points_ledger').insert({
    salon_id: salonId,
    client_id: clientId,
    type: 'spend',
    points: Math.round(earnedPoints),
    reason: 'service_payment',
    reference_id: appointmentId,
  })

  await supabase.from('clients').update({
    loyalty_points: currentPoints + Math.round(earnedPoints),
  }).eq('id', clientId)
}

export default function SellPackageModal({ salonId, clientId, clientName, onClose, onDone }: Props) {
  const [packages, setPackages] = useState<PackageOption[]>([])
  const [memberships, setMemberships] = useState<MembershipOption[]>([])
  const [staff, setStaff] = useState<StaffOption[]>([])
  const [loading, setLoading] = useState(true)

  // selection is "package:<id>" or "membership:<id>"
  const [selection, setSelection] = useState('')
  const [staffId, setStaffId] = useState('')
  const [method, setMethod] = useState<'cash' | 'card'>('cash')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [pkgRes, memRes, staffRes] = await Promise.all([
        supabase.from('packages')
          .select('id, name, price_package, validity_days, package_services(service_id, sort_order)')
          .eq('salon_id', salonId).eq('is_active', true).order('name', { ascending: true }),
        supabase.from('memberships')
          .select('id, name, price, validity_days, service_id')
          .eq('salon_id', salonId).eq('is_active', true).order('name', { ascending: true }),
        supabase.from('staff')
          .select('id, name').eq('salon_id', salonId).order('name', { ascending: true }),
      ])

      const pkgs: PackageOption[] = ((pkgRes.data ?? []) as unknown as {
        id: string; name: string; price_package: number | null; validity_days: number | null;
        package_services: { service_id: string; sort_order: number | null }[] | null
      }[]).map(p => {
        const svcs = [...(p.package_services ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        return {
          id: p.id,
          name: p.name,
          price: p.price_package ?? 0,
          validity_days: p.validity_days,
          serviceCount: svcs.length,
          firstServiceId: svcs[0]?.service_id ?? null,
        }
      })

      const mems: MembershipOption[] = ((memRes.data ?? []) as unknown as {
        id: string; name: string; price: number | null; validity_days: number | null; service_id: string
      }[]).map(m => ({
        id: m.id,
        name: m.name,
        price: m.price ?? 0,
        validity_days: m.validity_days ?? 30,
        serviceId: m.service_id,
      }))

      setPackages(pkgs)
      setMemberships(mems)
      setStaff((staffRes.data ?? []) as StaffOption[])
      setLoading(false)
    }
    load()
  }, [salonId])

  const selectedPackage = selection.startsWith('package:')
    ? packages.find(p => p.id === selection.slice('package:'.length)) ?? null
    : null
  const selectedMembership = selection.startsWith('membership:')
    ? memberships.find(m => m.id === selection.slice('membership:'.length)) ?? null
    : null
  const price = selectedPackage?.price ?? selectedMembership?.price ?? 0
  const canConfirm = !!(selectedPackage || selectedMembership) && staffId !== '' && !saving

  async function handleConfirm() {
    if (!canConfirm) return
    setErr(null)
    setSaving(true)

    const now = new Date()
    const nowIso = now.toISOString()

    const isPackage = !!selectedPackage
    const name = (selectedPackage?.name ?? selectedMembership?.name) ?? ''
    const validityDays = isPackage
      ? (selectedPackage!.validity_days ?? 30)
      : selectedMembership!.validity_days
    const validUntil = new Date(now.getTime() + validityDays * 86400000).toISOString()
    const sessionsTotal = isPackage ? selectedPackage!.serviceCount : null
    const saleServiceId = isPackage ? selectedPackage!.firstServiceId : selectedMembership!.serviceId

    if (!saleServiceId) {
      setSaving(false)
      setErr('This product has no service configured. Add a service to it first.')
      return
    }

    // 1. Purchase record
    const { data: purchaseRow, error: pErr } = await supabase.from('purchases').insert({
      salon_id: salonId,
      client_id: clientId,
      staff_id: staffId,
      kind: isPackage ? 'package' : 'membership',
      package_id: isPackage ? selectedPackage!.id : null,
      membership_id: isPackage ? null : selectedMembership!.id,
      price_paid: price,
      purchased_at: nowIso,
      valid_until: validUntil,
      sessions_total: sessionsTotal,
      sessions_remaining: sessionsTotal,
      status: 'active',
    }).select('id').single()

    if (pErr || !purchaseRow) {
      setSaving(false)
      setErr(pErr?.message ?? 'Could not create the purchase.')
      return
    }
    const purchaseId = (purchaseRow as { id: string }).id

    // 2. Sale appointment (completed) linked to the purchase
    const { data: apptRow, error: aErr } = await supabase.from('appointments').insert({
      salon_id: salonId,
      client_id: clientId,
      staff_id: staffId,
      starts_at: nowIso,
      ends_at: nowIso,
      status: 'completed',
      purchase_id: purchaseId,
      notes: `${isPackage ? 'Package' : 'Membership'} sale: ${name}`,
    }).select('id').single()

    if (aErr || !apptRow) {
      setSaving(false)
      setErr(aErr?.message ?? 'Could not create the sale appointment.')
      return
    }
    const appointmentId = (apptRow as { id: string }).id

    await supabase.from('purchases').update({ sale_appointment_id: appointmentId }).eq('id', purchaseId)

    // 3. One appointment_services row so commission goes fully to the assigned staff
    await supabase.from('appointment_services').insert({
      appointment_id: appointmentId,
      service_id: saleServiceId,
      staff_id: staffId,
      price,
      status: 'completed',
    })

    // 4. Payment to the assigned staff's appointment (picked up by existing commission + finance)
    await supabase.from('payments').insert({
      salon_id: salonId,
      appointment_id: appointmentId,
      client_id: clientId,
      amount: price,
      method,
      status: 'completed',
      reference: 'package_sale',
    })

    // 5. Earn loyalty points on the price paid (earning only)
    await earnLoyaltyPoints(clientId, salonId, appointmentId, price)

    setSaving(false)
    onDone()
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ backgroundColor: '#ffffff', borderRadius: 12, padding: 22, width: '100%', maxWidth: 420, boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}
      >
        <p style={{ fontSize: 15, fontWeight: 600, color: '#034325', margin: '0 0 4px' }}>Sell package or membership</p>
        <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 18px' }}>For {clientName}</p>

        {loading ? (
          <p style={{ fontSize: 12, color: '#6b7280', margin: '12px 0' }}>Loading…</p>
        ) : (
          <>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Product</label>
              <select value={selection} onChange={e => setSelection(e.target.value)} style={{ ...selectStyle, color: selection ? '#111' : '#9ca3af' }}>
                <option value="">Select a package or membership...</option>
                {packages.length > 0 && (
                  <optgroup label="Packages">
                    {packages.map(p => (
                      <option key={p.id} value={`package:${p.id}`}>{p.name} — AED {p.price.toFixed(2)}</option>
                    ))}
                  </optgroup>
                )}
                {memberships.length > 0 && (
                  <optgroup label="Memberships">
                    {memberships.map(m => (
                      <option key={m.id} value={`membership:${m.id}`}>{m.name} — AED {m.price.toFixed(2)}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Assigned staff</label>
              <select value={staffId} onChange={e => setStaffId(e.target.value)} style={{ ...selectStyle, color: staffId ? '#111' : '#9ca3af' }}>
                <option value="">Select staff...</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Payment method</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['cash', 'card'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    style={{
                      flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 500, borderRadius: 6, cursor: 'pointer',
                      border: method === m ? '0.5px solid #034325' : '0.5px solid #e0e0e0',
                      backgroundColor: method === m ? '#f0fdf4' : '#ffffff',
                      color: method === m ? '#034325' : '#6b7280',
                    }}
                  >{m === 'cash' ? 'Cash' : 'Card'}</button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '0.5px solid #e0e0e0', marginBottom: 16 }}>
              <span style={{ fontSize: 12, color: '#6b7280' }}>Price (final)</span>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#034325' }}>AED {price.toFixed(2)}</span>
            </div>

            {err && <p style={{ fontSize: 12, color: '#991b1b', margin: '0 0 12px' }}>{err}</p>}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleConfirm}
                disabled={!canConfirm}
                style={{ flex: 1, backgroundColor: canConfirm ? '#034325' : '#e0e0e0', color: canConfirm ? '#fff' : '#9ca3af', border: 'none', borderRadius: 6, padding: '9px 14px', fontSize: 13, fontWeight: 500, cursor: canConfirm ? 'pointer' : 'not-allowed' }}
              >{saving ? 'Selling…' : 'Confirm sale'}</button>
              <button
                onClick={onClose}
                disabled={saving}
                style={{ backgroundColor: 'transparent', color: '#034325', border: '0.5px solid #034325', borderRadius: 6, padding: '9px 16px', fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer' }}
              >Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
