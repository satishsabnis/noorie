import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Topbar from '../components/Topbar'
import { supabase } from '../lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApptDetail {
  id: string
  starts_at: string
  ends_at: string
  status: string
  is_walk_in: boolean
  notes: string | null
  client_id: string
  salon_id: string
  clients: {
    name: string
    phone: string | null
    visit_count: number | null
    last_visit_at: string | null
  } | null
}

interface ServiceRow {
  id: string
  service_id: string
  staff_id: string | null
  price: number
  status: string
  before_photos: string[] | null
  after_photos: string[] | null
  started_at: string | null
  completed_at: string | null
  serviceName: string
  durationMinutes: number
  staffName: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string) {
  const d = new Date(iso)
  const datePart = d.toLocaleDateString('en-GB', {
    timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', year: 'numeric',
  })
  const timePart = d.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hour12: false,
  })
  return `${datePart} · ${timePart}`
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const btnPrimary: React.CSSProperties = {
  backgroundColor: '#034325', color: '#ffffff',
  border: 'none', borderRadius: 6, padding: '9px 14px',
  fontSize: 12, fontWeight: 600, cursor: 'pointer', width: '100%',
}
const btnGrey: React.CSSProperties = {
  backgroundColor: 'transparent', color: '#6b7280',
  border: '0.5px solid #d1d5db', borderRadius: 6, padding: '7px 12px',
  fontSize: 12, cursor: 'pointer', flex: 1,
}
const btnRed: React.CSSProperties = {
  backgroundColor: 'transparent', color: '#dc2626',
  border: '0.5px solid #fca5a5', borderRadius: 6, padding: '7px 12px',
  fontSize: 12, cursor: 'pointer', flex: 1,
}
const btnSmall: React.CSSProperties = {
  backgroundColor: '#034325', color: '#ffffff',
  border: 'none', borderRadius: 5, padding: '5px 10px',
  fontSize: 11, cursor: 'pointer',
}
const btnSmallOutline: React.CSSProperties = {
  backgroundColor: 'transparent', color: '#6b7280',
  border: '0.5px solid #d1d5db', borderRadius: 5, padding: '5px 10px',
  fontSize: 11, cursor: 'pointer',
}

// ── Appointment status badge (shown on dark #034325 header) ───────────────────

function ApptStatusBadge({ status }: { status: string }) {
  const styleMap: Record<string, React.CSSProperties> = {
    completed:   { backgroundColor: '#ffffff', color: '#034325' },
    in_progress: { backgroundColor: '#00BF00', color: '#034325' },
    scheduled:   { backgroundColor: 'rgba(255,255,255,0.15)', color: '#ffffff', border: '0.5px solid rgba(255,255,255,0.4)' },
    no_show:     { backgroundColor: '#fee2e2', color: '#991b1b' },
    cancelled:   { backgroundColor: '#f3f4f6', color: '#6b7280' },
  }
  const labels: Record<string, string> = {
    completed: 'Completed', in_progress: 'In progress',
    scheduled: 'Scheduled', no_show: 'No show', cancelled: 'Cancelled',
  }
  return (
    <span style={{
      fontSize: 10, padding: '3px 9px', borderRadius: 4, fontWeight: 600, whiteSpace: 'nowrap',
      ...(styleMap[status] ?? styleMap.scheduled),
    }}>
      {labels[status] ?? status}
    </span>
  )
}

// ── Service card ──────────────────────────────────────────────────────────────

interface ServiceCardProps {
  svc: ServiceRow
  apptStatus: string
  saving: boolean
  onStart:    () => void
  onComplete: () => void
  onNoShow:   () => void
  onCancel:   () => void
  onPhoto:    (field: 'before_photos' | 'after_photos') => void
}

function ServiceCard({ svc, apptStatus, saving, onStart, onComplete, onNoShow, onCancel, onPhoto }: ServiceCardProps) {
  const actionsLocked = apptStatus === 'cancelled' || apptStatus === 'no_show' || apptStatus === 'completed'
  const beforeCount   = svc.before_photos?.length ?? 0
  const afterCount    = svc.after_photos?.length  ?? 0

  // ── COMPLETED ──────────────────────────────────────────────────────────────
  if (svc.status === 'completed') {
    return (
      <div style={{ border: '0.5px solid #034325', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ backgroundColor: '#f0fdf4', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#034325' }}>{svc.serviceName}</span>
            <span style={{ fontSize: 12, color: '#034325', marginLeft: 8 }}>AED {svc.price.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: '#034325' }}>{svc.staffName}</span>
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 600, backgroundColor: '#034325', color: '#ffffff', whiteSpace: 'nowrap' }}>
              Completed
            </span>
          </div>
        </div>
        <div style={{ backgroundColor: '#ffffff', padding: '10px 14px', display: 'flex', gap: 16 }}>
          <span style={{ fontSize: 11, color: '#6b7280' }}>Before: {beforeCount} photo{beforeCount !== 1 ? 's' : ''}</span>
          <span style={{ fontSize: 11, color: '#6b7280' }}>After: {afterCount} photo{afterCount !== 1 ? 's' : ''}</span>
        </div>
      </div>
    )
  }

  // ── IN PROGRESS ────────────────────────────────────────────────────────────
  if (svc.status === 'in_progress') {
    return (
      <div style={{ border: '1.5px solid #034325', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ backgroundColor: '#034325', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#ffffff' }}>{svc.serviceName}</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginLeft: 8 }}>AED {svc.price.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: '#00BF00' }}>{svc.staffName}</span>
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 600, backgroundColor: '#00BF00', color: '#034325', whiteSpace: 'nowrap' }}>
              In progress
            </span>
          </div>
        </div>
        <div style={{ backgroundColor: '#ffffff', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Before photos */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: '#6b7280' }}>
              Before photos{beforeCount > 0 ? ` · ${beforeCount} taken` : ''}
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button disabled={saving} onClick={() => onPhoto('before_photos')} style={btnSmall}>+ Photo</button>
              <span style={{ fontSize: 11, color: '#9ca3af', cursor: 'default' }}>Skip</span>
            </div>
          </div>
          {/* After photos */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: '#6b7280' }}>
              After photos{afterCount > 0 ? ` · ${afterCount} taken` : ''}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button disabled={saving} onClick={() => onPhoto('after_photos')} style={btnSmall}>Take photo</button>
              <button style={btnSmallOutline}>Skip</button>
            </div>
          </div>
          {!actionsLocked && (
            <>
              <button disabled={saving} onClick={onComplete} style={btnPrimary}>Complete service</button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button disabled={saving} onClick={onNoShow} style={btnGrey}>Mark no-show</button>
                <button disabled={saving} onClick={onCancel} style={btnRed}>Cancel</button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── PENDING ────────────────────────────────────────────────────────────────
  return (
    <div style={{ border: '0.5px solid #e0e0e0', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ backgroundColor: '#f9fafb', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#6b7280' }}>{svc.serviceName}</span>
          <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 8 }}>AED {svc.price.toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: '#6b7280' }}>{svc.staffName}</span>
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 500, backgroundColor: '#f9fafb', color: '#9ca3af', border: '0.5px solid #e0e0e0', whiteSpace: 'nowrap' }}>
            Pending
          </span>
        </div>
      </div>
      <div style={{ backgroundColor: '#ffffff', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Before photos row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: '#6b7280' }}>
            Before photos{beforeCount > 0 ? ` · ${beforeCount} taken` : ''}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button disabled={saving} onClick={() => onPhoto('before_photos')} style={btnSmall}>Take photo</button>
            <button style={btnSmallOutline}>Skip</button>
          </div>
        </div>
        {!actionsLocked && (
          <>
            <button disabled={saving} onClick={onStart} style={btnPrimary}>Start service</button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button disabled={saving} onClick={onNoShow} style={btnGrey}>Mark no-show</button>
              <button disabled={saving} onClick={onCancel} style={btnRed}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AppointmentDetail() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [appt, setAppt]         = useState<ApptDetail | null>(null)
  const [services, setServices] = useState<ServiceRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [fetchErr, setFetchErr] = useState<string | null>(null)
  const [saving, setSaving]     = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)

  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<'cash' | 'card'>('cash')

  const fileInputRef  = useRef<HTMLInputElement>(null)
  const [pendingPhoto, setPendingPhoto] = useState<{ serviceId: string; field: 'before_photos' | 'after_photos' } | null>(null)

  function refresh() { setRefreshTick(t => t + 1) }

  // ── Fetch ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setFetchErr(null)

    async function fetchData() {
      console.log('fetchData triggered', refreshTick)

      // Query 1: appointment + client
      const { data: apptData, error: apptErr } = await supabase
        .from('appointments')
        .select('id, starts_at, ends_at, status, is_walk_in, notes, client_id, salon_id, clients (name, phone, visit_count, last_visit_at)')
        .eq('id', id)
        .single()

      if (apptErr) {
        if (!cancelled) { setFetchErr(apptErr.message); setLoading(false) }
        return
      }

      // Query 2: appointment_services + services + staff
      const { data: svcData, error: svcErr } = await supabase
        .from('appointment_services')
        .select('id, service_id, staff_id, price, status, before_photos, after_photos, started_at, completed_at, services (name, duration_minutes), staff (name)')
        .eq('appointment_id', id)

      if (svcErr) {
        if (!cancelled) { setFetchErr(svcErr.message); setLoading(false) }
        return
      }

      const mapped: ServiceRow[] = (svcData ?? []).map(row => ({
        id:              row.id as string,
        service_id:      row.service_id as string,
        staff_id:        row.staff_id as string | null,
        price:           (row.price as number) ?? 0,
        status:          (row.status as string) ?? 'pending',
        before_photos:   row.before_photos as string[] | null,
        after_photos:    row.after_photos as string[] | null,
        started_at:      row.started_at as string | null,
        completed_at:    row.completed_at as string | null,
        serviceName:     (row.services as { name: string; duration_minutes: number } | null)?.name ?? '—',
        durationMinutes: (row.services as { name: string; duration_minutes: number } | null)?.duration_minutes ?? 0,
        staffName:       (row.staff as { name: string } | null)?.name ?? '—',
      }))

      if (!cancelled) {
        setAppt(apptData as unknown as ApptDetail)
        setServices(mapped)
        setLoading(false)
      }
    }

    fetchData()
    return () => { cancelled = true }
  }, [id, refreshTick])

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleStartService(serviceId: string) {
    setSaving(true)
    const now = new Date().toISOString()

    await supabase.from('appointment_services').update({ status: 'in_progress', started_at: now }).eq('id', serviceId)
    await supabase.from('appointments').update({ status: 'in_progress' }).eq('id', id)

    setSaving(false)
    refresh()
  }

  async function handleCompleteService(serviceId: string) {
    setSaving(true)
    const now = new Date().toISOString()
    await supabase.from('appointment_services').update({ status: 'completed', completed_at: now }).eq('id', serviceId)
    setSaving(false)
    refresh()
  }

  async function handleNoShow() {
    setSaving(true)
    await supabase.from('appointments').update({ status: 'no_show' }).eq('id', id)
    if (services.length > 0) {
      await supabase.from('appointment_services').update({ status: 'completed' }).in('id', services.map(s => s.id))
    }
    setSaving(false)
    refresh()
  }

  async function handleCancel() {
    setSaving(true)
    await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', id)
    setSaving(false)
    refresh()
  }

  async function handleCollectPayment() {
    if (!appt) return
    setSaving(true)
    const amount = parseFloat(payAmount || totalDue.toFixed(2))
    const { error: payErr } = await supabase.from('payments').insert({
      salon_id:       appt.salon_id,
      appointment_id: appt.id,
      client_id:      appt.client_id,
      amount,
      method:         payMethod,
      status:         'completed',
    })
    if (!payErr) {
      await supabase.from('appointments').update({ status: 'completed' }).eq('id', appt.id)
    }
    setSaving(false)
    navigate('/dashboard')
    refresh()
  }

  function triggerPhoto(serviceId: string, field: 'before_photos' | 'after_photos') {
    setPendingPhoto({ serviceId, field })
    setTimeout(() => fileInputRef.current?.click(), 0)
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !pendingPhoto || !appt) return
    setSaving(true)

    const ext  = file.name.split('.').pop() ?? 'jpg'
    const path = `${appt.salon_id}/${appt.id}/${pendingPhoto.serviceId}/${pendingPhoto.field}/${Date.now()}.${ext}`

    const { error: uploadErr } = await supabase.storage.from('appointment-photos').upload(path, file)
    if (uploadErr) { setSaving(false); setFetchErr(uploadErr.message); return }

    const { data: { publicUrl } } = supabase.storage.from('appointment-photos').getPublicUrl(path)

    const svc     = services.find(s => s.id === pendingPhoto.serviceId)
    const current = (pendingPhoto.field === 'before_photos' ? svc?.before_photos : svc?.after_photos) ?? []

    await supabase.from('appointment_services')
      .update({ [pendingPhoto.field]: [...current, publicUrl] })
      .eq('id', pendingPhoto.serviceId)

    if (fileInputRef.current) fileInputRef.current.value = ''
    setPendingPhoto(null)
    setSaving(false)
    refresh()
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const allSvcCompleted = services.length > 0 && services.every(s => s.status === 'completed')
  const totalDue        = services.reduce((sum, s) => sum + s.price, 0)
  const isTerminal      = appt?.status === 'cancelled' || appt?.status === 'no_show'
  const isPaid          = appt?.status === 'completed'

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', display: 'flex', flexDirection: 'column' }}>

      <Topbar />

      <div style={{ margin: '52px auto 0', flex: 1, padding: '20px 16px 32px', maxWidth: 680, width: '100%', boxSizing: 'border-box' }}>

        {/* Back + breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={{ background: 'transparent', border: '0.5px solid #034325', color: '#034325', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}
          >
            ← Back
          </button>
          <span style={{ color: '#6b7280', fontSize: 12 }}>Dashboard › Appointment detail</span>
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', padding: 40, color: '#6b7280', fontSize: 12, margin: 0 }}>Loading…</p>
        ) : fetchErr ? (
          <p style={{ textAlign: 'center', padding: 40, color: '#dc2626', fontSize: 12, margin: 0 }}>{fetchErr}</p>
        ) : !appt ? (
          <p style={{ textAlign: 'center', padding: 40, color: '#6b7280', fontSize: 12, margin: 0 }}>Appointment not found.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* ── Client header card ── */}
            <div style={{ backgroundColor: '#034325', borderRadius: 10, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ color: '#00BF00', fontSize: 11, margin: '0 0 4px' }}>
                  {fmtDateTime(appt.starts_at)}
                </p>
                <p style={{ color: '#ffffff', fontSize: 18, fontWeight: 500, margin: '0 0 6px', lineHeight: 1.2 }}>
                  {appt.clients?.name ?? 'Unknown client'}
                </p>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, margin: 0 }}>
                  {appt.clients?.phone ?? '—'}
                  {appt.clients?.visit_count != null && ` · ${appt.clients.visit_count} visits`}
                  {appt.is_walk_in && ' · Walk-in'}
                </p>
              </div>
              <div style={{ flexShrink: 0, paddingTop: 2 }}>
                <ApptStatusBadge status={appt.status} />
              </div>
            </div>

            {/* ── Service cards ── */}
            {services.map(svc => (
              <ServiceCard
                key={svc.id}
                svc={svc}
                apptStatus={appt.status}
                saving={saving}
                onStart={()    => handleStartService(svc.id)}
                onComplete={() => handleCompleteService(svc.id)}
                onNoShow={handleNoShow}
                onCancel={handleCancel}
                onPhoto={field => triggerPhoto(svc.id, field)}
              />
            ))}

            {/* ── Payment section ── */}
            {(!allSvcCompleted || isTerminal) ? (
              <div style={{ border: '0.5px solid #e0e0e0', borderRadius: 8, padding: '14px 16px', opacity: 0.5 }}>
                <p style={{ fontSize: 12, color: '#9ca3af', margin: 0, textAlign: 'center' }}>
                  Payment — available after all services complete
                </p>
              </div>
            ) : isPaid ? (
              <div style={{ border: '0.5px solid #034325', borderRadius: 8, padding: '14px 16px', backgroundColor: '#f0fdf4' }}>
                <p style={{ fontSize: 12, color: '#034325', fontWeight: 600, margin: 0, textAlign: 'center' }}>
                  Payment collected · AED {totalDue.toFixed(2)}
                </p>
              </div>
            ) : (
              <div style={{ backgroundColor: '#ffffff', border: '0.5px solid #e0e0e0', borderRadius: 8, padding: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#034325', margin: '0 0 12px' }}>Payment</p>

                {/* Per-service rows */}
                {services.map(svc => (
                  <div key={svc.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '0.5px solid #f0f0f0' }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{svc.serviceName}</span>
                    <span style={{ fontSize: 12, color: '#034325' }}>AED {svc.price.toFixed(2)}</span>
                  </div>
                ))}

                {/* Total row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 12px', borderTop: '0.5px solid #e0e0e0', marginTop: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#000000' }}>Total</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#034325' }}>AED {totalDue.toFixed(2)}</span>
                </div>

                {/* Amount + method */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: '#6b7280', display: 'block', marginBottom: 4 }}>Amount</label>
                    <input
                      type="number"
                      value={payAmount || totalDue.toFixed(2)}
                      onChange={e => setPayAmount(e.target.value)}
                      style={{ width: '100%', fontSize: 13, fontWeight: 500, color: '#034325', border: '0.5px solid #e0e0e0', borderRadius: 6, padding: '7px 10px', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: '#6b7280', display: 'block', marginBottom: 4 }}>Method</label>
                    <select
                      value={payMethod}
                      onChange={e => setPayMethod(e.target.value as 'cash' | 'card')}
                      style={{ width: '100%', fontSize: 12, color: '#000000', border: '0.5px solid #e0e0e0', borderRadius: 6, padding: '7px 10px', outline: 'none', cursor: 'pointer', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                    >
                      <option value="cash">Cash</option>
                      <option value="card">Card</option>
                    </select>
                  </div>
                </div>

                <button disabled={saving} onClick={handleCollectPayment} style={btnPrimary}>
                  {saving ? 'Processing…' : 'Collect payment'}
                </button>
              </div>
            )}

          </div>
        )}
      </div>

      {/* Hidden file input for camera/photo upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <div style={{ textAlign: 'center', padding: '10px 0 14px' }}>
        <p style={{ color: '#9ca3af', fontSize: 10, margin: 0 }}>Powered by Blue Flute Consulting LLC-FZ</p>
      </div>

    </div>
  )
}
