import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Topbar from '../components/Topbar'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

// ── Constants ─────────────────────────────────────────────────────────────────

const COUNTRY_CODES = ['+971', '+91', '+1', '+44']

// ── Types ─────────────────────────────────────────────────────────────────────

interface ServiceRow {
  id: string
  name: string
  duration_minutes: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parsePhone(phone: string | null): { countryCode: string; mobile: string } {
  if (!phone) return { countryCode: '+971', mobile: '' }
  for (const code of COUNTRY_CODES) {
    if (phone.startsWith(code)) return { countryCode: code, mobile: phone.slice(code.length) }
  }
  return { countryCode: '+971', mobile: phone }
}

// ── Styles ────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  fontSize: 13, color: '#000000', border: '0.5px solid #e0e0e0',
  borderRadius: 6, padding: '8px 10px', outline: 'none',
  backgroundColor: '#ffffff', boxSizing: 'border-box', width: '100%',
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.04em',
  display: 'block', marginBottom: 5,
}

const cardStyle: React.CSSProperties = {
  backgroundColor: '#f9fafb', border: '0.5px solid #e0e0e0',
  borderRadius: 8, padding: '16px 18px', marginBottom: 14,
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StaffForm() {
  const navigate    = useNavigate()
  const { id }      = useParams<{ id: string }>()
  const isEdit      = !!id
  const staffRecord = useAuthStore(s => s.staffRecord)
  const salonId     = staffRecord?.salon_id ?? null

  // Personal details
  const [name,        setName]        = useState('')
  const [countryCode, setCountryCode] = useState('+971')
  const [mobile,      setMobile]      = useState('')
  const [role,        setRole]        = useState<'supervisor' | 'technician'>('technician')
  const [password,    setPassword]    = useState('')
  const [status,      setStatus]      = useState<'active' | 'suspended'>('active')

  // Services
  const [allServices,     setAllServices]     = useState<ServiceRow[]>([])
  const [checkedServices, setCheckedServices] = useState<Set<string>>(new Set())
  const [newSvcName,      setNewSvcName]      = useState('')
  const [newSvcDuration,  setNewSvcDuration]  = useState('')

  // UI state
  const [loading,           setLoading]           = useState(isEdit)
  const [saving,            setSaving]            = useState(false)
  const [addingSvc,         setAddingSvc]         = useState(false)
  const [error,             setError]             = useState<string | null>(null)
  const [changed,           setChanged]           = useState(!isEdit)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // ── Fetch on mount ─────────────────────────────────────────────────────────

  useEffect(() => {
    async function fetchData() {
      if (!salonId) { setLoading(false); return }

      // Always fetch salon's full service catalogue
      const { data: svcData } = await supabase
        .from('services')
        .select('id, name, duration_minutes')
        .eq('salon_id', salonId)
        .order('name', { ascending: true })

      setAllServices((svcData ?? []).map(s => ({
        id:                 s.id                 as string,
        name:               s.name               as string,
        duration_minutes:   (s.duration_minutes  as number) ?? 0,
      })))

      if (isEdit && id) {
        const [{ data: staffData }, { data: ssData }] = await Promise.all([
          supabase.from('staff').select('id, name, phone, role, status').eq('id', id).single(),
          supabase.from('staff_services').select('service_id').eq('staff_id', id),
        ])

        if (staffData) {
          const { countryCode: cc, mobile: mob } = parsePhone(staffData.phone as string | null)
          setName(staffData.name as string)
          setCountryCode(cc)
          setMobile(mob)
          setRole((staffData.role as 'supervisor' | 'technician') ?? 'technician')
          setStatus((staffData.status as 'active' | 'suspended') ?? 'active')
        }

        setCheckedServices(new Set((ssData ?? []).map(ss => ss.service_id as string)))
        setLoading(false)
      }
    }
    fetchData()
  }, [salonId, id, isEdit]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ──────────────────────────────────────────────────────────────

  function mark() { setChanged(true) }

  function toggleService(svcId: string) {
    setCheckedServices(prev => {
      const next = new Set(prev)
      if (next.has(svcId)) next.delete(svcId); else next.add(svcId)
      return next
    })
    mark()
  }

  async function handleAddService() {
    if (!newSvcName.trim() || !newSvcDuration.trim() || !salonId) return
    setAddingSvc(true)
    const { data, error: svcErr } = await supabase
      .from('services')
      .insert({ salon_id: salonId, name: newSvcName.trim(), duration_minutes: parseInt(newSvcDuration), price: 0 })
      .select('id, name, duration_minutes')
      .single()
    if (!svcErr && data) {
      const row: ServiceRow = {
        id: data.id as string, name: data.name as string,
        duration_minutes: (data.duration_minutes as number) ?? 0,
      }
      setAllServices(prev => [...prev, row].sort((a, b) => a.name.localeCompare(b.name)))
      setCheckedServices(prev => new Set([...prev, row.id]))
      setNewSvcName('')
      setNewSvcDuration('')
    }
    setAddingSvc(false)
  }

  async function handleSave() {
    if (!name.trim()) { setError('Name is required'); return }
    if (!mobile.trim()) { setError('Mobile number is required'); return }
    setSaving(true)
    setError(null)

    const phone = `${countryCode}${mobile.trim()}`

    try {
      if (!isEdit) {
        // Add: create auth user then insert staff record
        if (!password.trim()) { setError('Temporary password is required'); setSaving(false); return }
        const email = `${phone.replace(/\D/g, '')}@noorie.internal`
        const { data: authData, error: authErr } = await supabase.auth.signUp({ email, password: password.trim() })
        if (authErr) throw authErr
        const authUserId = authData.user?.id ?? null

        const { data: newStaff, error: staffErr } = await supabase
          .from('staff')
          .insert({ salon_id: salonId, name: name.trim(), phone, role, auth_user_id: authUserId, status: 'active', temp_password_set: true })
          .select('id')
          .single()
        if (staffErr) throw staffErr

        if (checkedServices.size > 0) {
          await supabase.from('staff_services').insert(
            [...checkedServices].map(svcId => ({ staff_id: newStaff.id, service_id: svcId }))
          )
        }
      } else {
        // Edit: update staff, re-sync services
        const { error: updErr } = await supabase
          .from('staff')
          .update({ name: name.trim(), phone, role, status })
          .eq('id', id!)
        if (updErr) throw updErr

        await supabase.from('staff_services').delete().eq('staff_id', id!)
        if (checkedServices.size > 0) {
          await supabase.from('staff_services').insert(
            [...checkedServices].map(svcId => ({ staff_id: id!, service_id: svcId }))
          )
        }
      }

      navigate('/staff')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!id) return
    setSaving(true)
    const { error: delErr } = await supabase.from('staff').update({ status: 'deleted' }).eq('id', id)
    if (delErr) { setError(delErr.message); setSaving(false); return }
    navigate('/staff')
  }

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
        <Topbar />
        <div style={{ marginTop: 52, padding: '40px 16px', textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: '#6b7280' }}>Loading…</p>
        </div>
      </div>
    )
  }

  const canSave = !saving && (isEdit ? changed : true)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', display: 'flex', flexDirection: 'column' }}>
      <Topbar />

      <div style={{ marginTop: 52, flex: 1, padding: '20px 16px 32px' }}>

        {/* Header breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button
            onClick={() => navigate('/staff')}
            style={{
              background: 'none', border: '0.5px solid #034325', color: '#034325',
              borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 500,
            }}
          >
            ← Back
          </button>
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            Staff › {isEdit ? 'Edit staff member' : 'Add staff member'}
          </span>
        </div>

        {/* Two-column layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16, alignItems: 'start' }}>

          {/* ── Left column ── */}
          <div>

            {/* Personal details */}
            <div style={cardStyle}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#034325', margin: '0 0 14px' }}>Personal details</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                <div>
                  <label style={labelStyle}>Full name *</label>
                  <input
                    value={name} onChange={e => { setName(e.target.value); mark() }}
                    style={inputStyle} placeholder="Full name"
                  />
                </div>

                <div>
                  <label style={labelStyle}>Mobile</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select
                      value={countryCode} onChange={e => { setCountryCode(e.target.value); mark() }}
                      style={{ ...inputStyle, width: 80, flexShrink: 0, appearance: 'none', cursor: 'pointer' }}
                    >
                      {COUNTRY_CODES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input
                      value={mobile} onChange={e => { setMobile(e.target.value); mark() }}
                      style={inputStyle} placeholder="Mobile number" type="tel"
                    />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Role</label>
                  <select
                    value={role} onChange={e => { setRole(e.target.value as 'supervisor' | 'technician'); mark() }}
                    style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
                  >
                    <option value="supervisor">Supervisor</option>
                    <option value="technician">Technician</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>{isEdit ? 'Reset password' : 'Temporary password'}</label>
                  <input
                    value={password} onChange={e => { setPassword(e.target.value); mark() }}
                    style={inputStyle} type="password"
                    placeholder={isEdit ? 'Leave blank to keep current password' : 'Temporary password'}
                  />
                  {isEdit && (
                    <p style={{ fontSize: 11, color: '#6b7280', margin: '4px 0 0' }}>
                      Password reset requires admin action via the Supabase dashboard.
                    </p>
                  )}
                </div>

              </div>
            </div>

            {/* Account status — edit only */}
            {isEdit && (
              <div style={cardStyle}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#034325', margin: '0 0 14px' }}>Account status</p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <button
                    onClick={() => { setStatus('active'); mark() }}
                    style={{
                      flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 500, borderRadius: 6, cursor: 'pointer',
                      border: '0.5px solid #034325',
                      backgroundColor: status === 'active' ? '#034325' : 'transparent',
                      color: status === 'active' ? '#ffffff' : '#034325',
                    }}
                  >Active</button>
                  <button
                    onClick={() => { setStatus('suspended'); mark() }}
                    style={{
                      flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 500, borderRadius: 6, cursor: 'pointer',
                      border: '0.5px solid #C9A227',
                      backgroundColor: status === 'suspended' ? '#fef3c7' : 'transparent',
                      color: '#C9A227',
                    }}
                  >Suspend</button>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    style={{
                      flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 500, borderRadius: 6, cursor: 'pointer',
                      border: '0.5px solid #991b1b', backgroundColor: 'transparent', color: '#991b1b',
                    }}
                  >Delete</button>
                </div>
                <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>
                  Suspended staff cannot log in but their data is preserved. Deletion is permanent.
                </p>

                {showDeleteConfirm && (
                  <div style={{
                    marginTop: 12, padding: '12px 14px',
                    backgroundColor: '#fff5f5', border: '0.5px solid #991b1b', borderRadius: 6,
                  }}>
                    <p style={{ fontSize: 12, color: '#991b1b', fontWeight: 500, margin: '0 0 10px' }}>
                      Delete this staff member? This cannot be undone.
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={handleDelete} disabled={saving}
                        style={{
                          backgroundColor: '#991b1b', color: '#ffffff', border: 'none',
                          borderRadius: 6, padding: '6px 16px', fontSize: 12, cursor: 'pointer', fontWeight: 500,
                        }}
                      >Confirm delete</button>
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        style={{
                          backgroundColor: 'transparent', color: '#6b7280',
                          border: '0.5px solid #d1d5db', borderRadius: 6, padding: '6px 16px', fontSize: 12, cursor: 'pointer',
                        }}
                      >Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {error && <p style={{ fontSize: 12, color: '#991b1b', margin: '0 0 14px' }}>{error}</p>}

            {/* Save / Cancel */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleSave} disabled={!canSave}
                style={{
                  flex: 1, border: 'none', borderRadius: 6, padding: '10px 0',
                  fontSize: 13, fontWeight: 600, cursor: canSave ? 'pointer' : 'not-allowed',
                  backgroundColor: canSave ? '#034325' : '#e0e0e0',
                  color: canSave ? '#ffffff' : '#9ca3af',
                }}
              >
                {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save staff member'}
              </button>
              <button
                onClick={() => navigate('/staff')}
                style={{
                  flex: 1, backgroundColor: 'transparent', color: '#6b7280',
                  border: '0.5px solid #d1d5db', borderRadius: 6, padding: '10px 0',
                  fontSize: 13, cursor: 'pointer',
                }}
              >Cancel</button>
            </div>

          </div>

          {/* ── Right column — Services ── */}
          <div style={cardStyle}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#034325', margin: '0 0 2px' }}>Services</p>
            <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 14px' }}>Check all this staff can perform</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {allServices.length === 0 && (
                <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>No services in catalogue yet.</p>
              )}
              {allServices.map(svc => (
                <label key={svc.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  cursor: 'pointer', padding: '6px 4px',
                }}>
                  <input
                    type="checkbox"
                    checked={checkedServices.has(svc.id)}
                    onChange={() => toggleService(svc.id)}
                    style={{ accentColor: '#034325', width: 14, height: 14, flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 13, color: '#000000', flex: 1 }}>{svc.name}</span>
                  <span style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>{svc.duration_minutes} min</span>
                </label>
              ))}
            </div>

            {/* Add new service to catalogue */}
            <div style={{ borderTop: '0.5px solid #e0e0e0', marginTop: 16, paddingTop: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 500, color: '#034325', margin: '0 0 10px' }}>
                Add new service to catalogue
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  value={newSvcName} onChange={e => setNewSvcName(e.target.value)}
                  placeholder="Service name"
                  style={{ ...inputStyle, fontSize: 12 }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={newSvcDuration} onChange={e => setNewSvcDuration(e.target.value)}
                    placeholder="Duration (min)" type="number"
                    style={{ ...inputStyle, fontSize: 12, flex: 1 }}
                  />
                  <button
                    onClick={handleAddService}
                    disabled={addingSvc || !newSvcName.trim() || !newSvcDuration.trim()}
                    style={{
                      border: 'none', borderRadius: 6, padding: '8px 14px',
                      fontSize: 12, fontWeight: 500, flexShrink: 0,
                      cursor: (!newSvcName.trim() || !newSvcDuration.trim()) ? 'not-allowed' : 'pointer',
                      backgroundColor: (!newSvcName.trim() || !newSvcDuration.trim()) ? '#e0e0e0' : '#034325',
                      color: (!newSvcName.trim() || !newSvcDuration.trim()) ? '#9ca3af' : '#ffffff',
                    }}
                  >
                    {addingSvc ? '…' : '+ Add'}
                  </button>
                </div>
                <p style={{ fontSize: 10, color: '#9ca3af', margin: 0 }}>
                  Adding a service here adds it to your salon's catalogue and assigns it to this staff member.
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>

      <div style={{ textAlign: 'center', padding: '10px 0 14px' }}>
        <p style={{ color: '#9ca3af', fontSize: 10, margin: 0 }}>Powered by Blue Flute Consulting LLC-FZ</p>
      </div>
    </div>
  )
}
