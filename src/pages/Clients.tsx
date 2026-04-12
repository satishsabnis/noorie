import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Topbar from '../components/Topbar'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClientRow {
  id: string
  name: string
  phone: string | null
  email: string | null
  loyalty_points: number
  totalSpend: number
  visitCount: number
  lastVisit: string | null
}

type SortKey = 'name' | 'last_visit' | 'total_spend' | 'visit_count'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', year: 'numeric',
  })
}

// ── Styles ────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  fontSize: 12, color: '#000000', border: '0.5px solid #e0e0e0',
  borderRadius: 6, padding: '7px 10px', outline: 'none',
  backgroundColor: '#ffffff', boxSizing: 'border-box',
}

const TH: React.CSSProperties = {
  textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280',
  padding: '8px 12px', borderBottom: '0.5px solid #e0e0e0',
  whiteSpace: 'nowrap', backgroundColor: '#f9fafb',
}

const TD: React.CSSProperties = {
  fontSize: 12, color: '#000000', padding: '10px 12px',
  borderBottom: '0.5px solid #f0f0f0', verticalAlign: 'middle',
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Clients() {
  const navigate  = useNavigate()
  const staffRecord = useAuthStore(s => s.staffRecord)

  const [clients,    setClients]    = useState<ClientRow[]>([])
  const [loading,    setLoading]    = useState(true)
  const [query,      setQuery]      = useState('')
  const [sort,       setSort]       = useState<SortKey>('name')
  const [showModal,  setShowModal]  = useState(false)

  // Add-client form
  const [newName,    setNewName]    = useState('')
  const [newPhone,   setNewPhone]   = useState('')
  const [newEmail,   setNewEmail]   = useState('')
  const [newDob,     setNewDob]     = useState('')
  const [addSaving,  setAddSaving]  = useState(false)
  const [addError,   setAddError]   = useState<string | null>(null)

  // ── Fetch ─────────────────────────────────────────────────────────────────

  async function fetchClients() {
    const salonId = staffRecord?.salon_id
    if (!salonId) { setLoading(false); return }

    // Q1: clients
    const { data: clientData } = await supabase
      .from('clients')
      .select('id, name, phone, email, loyalty_points')
      .eq('salon_id', salonId)

    if (!clientData) { setLoading(false); return }
    if (clientData.length === 0) { setClients([]); setLoading(false); return }

    const ids = clientData.map(c => c.id as string)

    // Q2: payments — total spend per client
    const { data: payData } = await supabase
      .from('payments')
      .select('client_id, amount')
      .in('client_id', ids)

    const spendMap: Record<string, number> = {}
    for (const p of payData ?? []) {
      const cid = p.client_id as string
      spendMap[cid] = (spendMap[cid] ?? 0) + ((p.amount as number) ?? 0)
    }

    // Q3: appointments — visit count + last visit (completed only)
    const { data: apptData } = await supabase
      .from('appointments')
      .select('client_id, status, starts_at')
      .in('client_id', ids)
      .eq('salon_id', salonId)

    const visitMap: Record<string, { count: number; lastVisit: string | null }> = {}
    for (const a of apptData ?? []) {
      const cid = a.client_id as string
      if (!visitMap[cid]) visitMap[cid] = { count: 0, lastVisit: null }
      if (a.status === 'completed') {
        visitMap[cid].count++
        const t = a.starts_at as string
        if (!visitMap[cid].lastVisit || t > visitMap[cid].lastVisit!) visitMap[cid].lastVisit = t
      }
    }

    const rows: ClientRow[] = clientData.map(c => ({
      id:             c.id as string,
      name:           c.name as string,
      phone:          c.phone as string | null,
      email:          c.email as string | null,
      loyalty_points: (c.loyalty_points as number) ?? 0,
      totalSpend:     Math.round((spendMap[c.id as string] ?? 0) * 100) / 100,
      visitCount:     visitMap[c.id as string]?.count ?? 0,
      lastVisit:      visitMap[c.id as string]?.lastVisit ?? null,
    }))

    setClients(rows)
    setLoading(false)
  }

  useEffect(() => { fetchClients() }, [staffRecord?.salon_id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Add client ────────────────────────────────────────────────────────────

  async function handleAddClient() {
    if (!newName.trim()) { setAddError('Name is required'); return }
    setAddSaving(true)
    setAddError(null)
    const { error } = await supabase.from('clients').insert({
      salon_id: staffRecord?.salon_id,
      name:     newName.trim(),
      phone:    newPhone.trim() || null,
      email:    newEmail.trim() || null,
      dob:      newDob || null,
    })
    if (error) { setAddError(error.message); setAddSaving(false); return }
    setShowModal(false)
    setNewName(''); setNewPhone(''); setNewEmail(''); setNewDob('')
    setAddSaving(false)
    setLoading(true)
    fetchClients()
  }

  function openModal() { setShowModal(true); setAddError(null); setNewName(''); setNewPhone(''); setNewEmail(''); setNewDob('') }

  // ── Filter + sort ─────────────────────────────────────────────────────────

  const filtered = clients.filter(c => {
    const q = query.toLowerCase()
    return (
      c.name.toLowerCase().includes(q) ||
      (c.phone ?? '').includes(q) ||
      (c.email ?? '').toLowerCase().includes(q)
    )
  })

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'last_visit')   return (b.lastVisit ?? '').localeCompare(a.lastVisit ?? '')
    if (sort === 'total_spend')  return b.totalSpend - a.totalSpend
    if (sort === 'visit_count')  return b.visitCount - a.visitCount
    return a.name.localeCompare(b.name)
  })

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', display: 'flex', flexDirection: 'column' }}>
      <Topbar />

      <div style={{ marginTop: 52, flex: 1, padding: '20px 16px 32px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <p style={{ fontSize: 16, fontWeight: 600, color: '#000000', margin: 0 }}>Clients</p>
          <button
            onClick={openModal}
            style={{ backgroundColor: '#034325', color: '#ffffff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            + Add client
          </button>
        </div>

        {/* Search + sort */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <input
            type="text"
            placeholder="Search by name, phone or email…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
          />
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortKey)}
            style={{ ...inputStyle, appearance: 'none', cursor: 'pointer', minWidth: 140 }}
          >
            <option value="name">Name A–Z</option>
            <option value="last_visit">Last visit</option>
            <option value="total_spend">Total spend</option>
            <option value="visit_count">Visit count</option>
          </select>
        </div>

        {/* Table */}
        <div style={{ backgroundColor: '#ffffff', border: '0.5px solid #e0e0e0', borderRadius: 8, overflow: 'hidden' }}>
          {loading ? (
            <p style={{ textAlign: 'center', padding: 40, color: '#6b7280', fontSize: 12, margin: 0 }}>Loading…</p>
          ) : sorted.length === 0 ? (
            <p style={{ textAlign: 'center', padding: 40, color: '#6b7280', fontSize: 12, margin: 0 }}>No clients found.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={TH}>Name</th>
                  <th style={TH}>Phone</th>
                  <th style={TH}>Email</th>
                  <th style={TH}>Last visit</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Visits</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Total spend</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Loyalty pts</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(c => (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/client/${c.id}`)}
                    style={{ cursor: 'pointer', backgroundColor: '#ffffff' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f9fafb')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#ffffff')}
                  >
                    <td style={{ ...TD, cursor: 'pointer' }} onClick={() => navigate(`/client/${c.id}`)}>
                      <span style={{ color: '#034325', fontWeight: 500 }}>{c.name}</span>
                    </td>
                    <td style={{ ...TD, color: '#6b7280' }}>{c.phone ?? '—'}</td>
                    <td style={{ ...TD, color: '#6b7280' }}>{c.email ?? '—'}</td>
                    <td style={{ ...TD, color: '#6b7280' }}>{fmtDate(c.lastVisit)}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{c.visitCount}</td>
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 500 }}>
                      AED {c.totalSpend.toFixed(2)}
                    </td>
                    <td style={{ ...TD, textAlign: 'right', color: '#C9A227', fontWeight: 500 }}>
                      {c.loyalty_points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>

      {/* Add client modal */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
          zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{
            backgroundColor: '#ffffff', borderRadius: 10, padding: 24,
            width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#034325', margin: 0 }}>Add client</p>
            <input
              type="text"
              placeholder="Full name *"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              style={{ ...inputStyle, width: '100%' }}
              autoFocus
            />
            <input
              type="tel"
              placeholder="Phone"
              value={newPhone}
              onChange={e => setNewPhone(e.target.value)}
              style={{ ...inputStyle, width: '100%' }}
            />
            <input
              type="email"
              placeholder="Email"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              style={{ ...inputStyle, width: '100%' }}
            />
            <div>
              <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>Date of birth</label>
              <input
                type="date"
                value={newDob}
                onChange={e => setNewDob(e.target.value)}
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>
            {addError && <p style={{ fontSize: 11, color: '#991b1b', margin: 0 }}>{addError}</p>}
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                onClick={handleAddClient}
                disabled={addSaving}
                style={{
                  flex: 1, backgroundColor: '#034325', color: '#ffffff',
                  border: 'none', borderRadius: 6, padding: '9px 0',
                  fontSize: 12, fontWeight: 600, cursor: addSaving ? 'not-allowed' : 'pointer',
                }}
              >
                {addSaving ? 'Saving…' : 'Save client'}
              </button>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  flex: 1, backgroundColor: 'transparent', color: '#6b7280',
                  border: '0.5px solid #d1d5db', borderRadius: 6, padding: '9px 0',
                  fontSize: 12, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center', padding: '10px 0 14px' }}>
        <p style={{ color: '#9ca3af', fontSize: 10, margin: 0 }}>Powered by Blue Flute Consulting LLC-FZ</p>
      </div>
    </div>
  )
}
