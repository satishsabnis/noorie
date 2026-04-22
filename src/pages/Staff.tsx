import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Topbar from '../components/Topbar'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

// ── Types ─────────────────────────────────────────────────────────────────────

interface StaffMember {
  id: string
  name: string
  phone: string | null
  role: string | null
  status: string | null
  services: { name: string }[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name.split(' ').map(w => w[0] ?? '').join('').toUpperCase().slice(0, 2)
}

// ── Staff card ────────────────────────────────────────────────────────────────

function StaffCard({ member, onEdit }: { member: StaffMember; onEdit: () => void }) {
  const suspended = member.status === 'suspended'
  const avatarBg  = member.role === 'supervisor' ? '#034325' : '#1D558F'

  return (
    <div style={{
      backgroundColor: '#f9fafb', borderRadius: 8, border: '0.5px solid #e0e0e0',
      padding: '14px 16px', opacity: suspended ? 0.6 : 1,
      display: 'flex', alignItems: 'flex-start', gap: 12,
    }}>
      {/* Avatar */}
      <div style={{
        width: 40, height: 40, borderRadius: '50%', backgroundColor: avatarBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <span style={{ color: '#ffffff', fontSize: 14, fontWeight: 500 }}>{initials(member.name)}</span>
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: '#111111', margin: '0 0 2px' }}>{member.name}</p>
        <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 8px' }}>
          {member.phone ?? '—'} · {member.role ?? '—'}
        </p>
        {member.services.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {member.services.map((svc, i) => (
              <span key={i} style={{
                backgroundColor: '#f0fdf4', color: '#034325',
                border: '0.5px solid #034325', fontSize: 10,
                padding: '2px 8px', borderRadius: 10,
              }}>
                {svc.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Right: badge + edit */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
        <span style={{
          fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 4,
          backgroundColor: suspended ? '#fef3c7' : '#f0fdf4',
          color:           suspended ? '#92400e' : '#034325',
        }}>
          {suspended ? 'Suspended' : 'Active'}
        </span>
        <button
          onClick={onEdit}
          style={{
            background: 'none', border: '0.5px solid #034325', color: '#034325',
            borderRadius: 6, padding: '4px 12px', fontSize: 11, cursor: 'pointer',
          }}
        >
          Edit
        </button>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Staff() {
  const navigate    = useNavigate()
  const staffRecord = useAuthStore(s => s.staffRecord)
  const [staff,   setStaff]   = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStaff() {
      const salonId = staffRecord?.salon_id
      if (!salonId) { setLoading(false); return }

      const { data, error } = await supabase
        .from('staff')
        .select('id, name, phone, role, status, staff_services ( services ( name ) )')
        .eq('salon_id', salonId)
        .neq('status', 'deleted')
        .order('name', { ascending: true })

      if (!data || error) { setLoading(false); return }

      const rows: StaffMember[] = data.map(s => ({
        id:       s.id     as string,
        name:     s.name   as string,
        phone:    s.phone  as string | null,
        role:     s.role   as string | null,
        status:   s.status as string | null,
        services: ((s.staff_services as { services: { name: string } | null }[]) ?? [])
          .map(ss => ss.services)
          .filter((sv): sv is { name: string } => !!sv),
      }))

      setStaff(rows)
      setLoading(false)
    }
    fetchStaff()
  }, [staffRecord?.salon_id])

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', display: 'flex', flexDirection: 'column' }}>
      <Topbar />

      <div style={{ marginTop: 52, flex: 1, padding: '20px 16px 32px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <p style={{ fontSize: 16, fontWeight: 600, color: '#000000', margin: 0 }}>Staff</p>
          <button
            onClick={() => navigate('/staff/new')}
            style={{
              backgroundColor: '#034325', color: '#ffffff', border: 'none',
              borderRadius: 6, padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            + Add staff
          </button>
        </div>

        {/* List */}
        {loading ? (
          <p style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', padding: '40px 0' }}>Loading…</p>
        ) : staff.length === 0 ? (
          <p style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', padding: '40px 0' }}>No staff found.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {staff.map(s => (
              <StaffCard key={s.id} member={s} onEdit={() => navigate(`/staff/${s.id}`)} />
            ))}
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', padding: '10px 0 14px' }}>
        <p style={{ color: '#9ca3af', fontSize: 10, margin: 0 }}>Powered by Blue Flute Consulting LLC-FZ</p>
      </div>
    </div>
  )
}
