import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Topbar from '../components/Topbar'
import { supabase } from '../lib/supabase'
import { useSalonTimezone } from '../hooks/useSalonTimezone'

interface ApptDetail {
  id: string
  reference_number: number | null
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

function fmtApptRef(n: number | null | undefined): string {
  return n != null ? `APT-${String(n).padStart(4, '0')}` : '—'
}

interface PaymentRow {
  id: string
  created_at: string
  amount: number
  method: string
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

function fmtDateTime(iso: string, tz = 'Asia/Dubai') {
  const d = new Date(iso)
  const datePart = d.toLocaleDateString('en-GB', {
    timeZone: tz, day: 'numeric', month: 'short', year: 'numeric',
  })
  const timePart = d.toLocaleTimeString('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  })
  return `${datePart} · ${timePart}`
}

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

interface ServiceCardProps {
  svc: ServiceRow
  apptStatus: string
  saving: boolean
  onStart: () => void
  onComplete: () => void
  onNoShow: () => void
  onCancel: () => void
  onPhoto: (field: 'before_photos' | 'after_photos') => void
}

function ServiceCard({ svc, apptStatus, saving, onStart, onComplete, onNoShow, onCancel, onPhoto }: ServiceCardProps) {
  const actionsLocked = apptStatus === 'cancelled' || apptStatus === 'no_show' || apptStatus === 'completed'
  const beforeCount = svc.before_photos?.length ?? 0
  const afterCount = svc.after_photos?.length ?? 0

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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: '#6b7280' }}>
              Before photos{beforeCount > 0 ? ` · ${beforeCount} taken` : ''}
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button disabled={saving} onClick={() => onPhoto('before_photos')} style={btnSmall}>+ Photo</button>
              <span style={{ fontSize: 11, color: '#9ca3af', cursor: 'default' }}>Skip</span>
            </div>
          </div>
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

export default function AppointmentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { tz } = useSalonTimezone()

  const [appt, setAppt] = useState<ApptDetail | null>(null)
  const [services, setServices] = useState<ServiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchErr, setFetchErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)

  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [servicePrices, setServicePrices] = useState<Record<string, string>>({})
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<'cash' | 'card'>('cash')

  const [allServices, setAllServices] = useState<{ id: string; name: string; price: number }[]>([])
  const [allStaff, setAllStaff] = useState<{ id: string; name: string }[]>([])
  const [addSvcId, setAddSvcId] = useState('')
  const [addStaffId, setAddStaffId] = useState('')
  const [addPrice, setAddPrice] = useState('')
  const [addingSvc, setAddingSvc] = useState(false)
  const [showBlindBox, setShowBlindBox] = useState(false);
  const [bbCampaign, setBbCampaign] = useState<{
    id: string; name: string; price: number; reward_type: string;
    discount_value: number; prize_validity_days: number; trigger_at_service: number;
    eligible_tiers: string;
  } | null>(null);
  const [bbRevealedService, setBbRevealedService] = useState<{ id: string; name: string } | null>(null);
  const [bbChoice, setBbChoice] = useState<'use_now' | 'save' | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingPhoto, setPendingPhoto] = useState<{ serviceId: string; field: 'before_photos' | 'after_photos' } | null>(null)

  function refresh() { setRefreshTick(t => t + 1) }

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setFetchErr(null)

    async function fetchData() {
      const { data: apptData, error: apptErr } = await supabase
        .from('appointments')
        .select('id, reference_number, starts_at, ends_at, status, is_walk_in, notes, client_id, salon_id, clients (name, phone, visit_count, last_visit_at)')
        .eq('id', id)
        .single()

      if (apptErr) {
        if (!cancelled) { setFetchErr(apptErr.message); setLoading(false) }
        return
      }

      const { data: svcData, error: svcErr } = await supabase
        .from('appointment_services')
        .select('id, service_id, staff_id, price, status, before_photos, after_photos, started_at, completed_at, services (name, duration_minutes), staff (name)')
        .eq('appointment_id', id)

      if (svcErr) {
        if (!cancelled) { setFetchErr(svcErr.message); setLoading(false) }
        return
      }

      const mapped: ServiceRow[] = (svcData ?? []).map((row: any) => {
        let serviceName = '—'
        let durationMinutes = 0
        const servicesData = row.services
        if (Array.isArray(servicesData) && servicesData.length > 0) {
          serviceName = servicesData[0]?.name ?? '—'
          durationMinutes = servicesData[0]?.duration_minutes ?? 0
        } else if (servicesData && !Array.isArray(servicesData)) {
          serviceName = servicesData.name ?? '—'
          durationMinutes = servicesData.duration_minutes ?? 0
        }
        
        let staffName = '—'
        const staffData = row.staff
        if (Array.isArray(staffData) && staffData.length > 0) {
          staffName = staffData[0]?.name ?? '—'
        } else if (staffData && !Array.isArray(staffData)) {
          staffName = staffData.name ?? '—'
        }
        
        return {
          id: row.id as string,
          service_id: row.service_id as string,
          staff_id: row.staff_id as string | null,
          price: (row.price as number) ?? 0,
          status: (row.status as string) ?? 'pending',
          before_photos: row.before_photos as string[] | null,
          after_photos: row.after_photos as string[] | null,
          started_at: row.started_at as string | null,
          completed_at: row.completed_at as string | null,
          serviceName: serviceName,
          durationMinutes: durationMinutes,
          staffName: staffName,
        }
      })

      const { data: payData } = await supabase
        .from('payments')
        .select('id, created_at, amount, method')
        .eq('appointment_id', id)
        .order('created_at', { ascending: true })

      const priceMap: Record<string, string> = {}
      for (const svc of mapped) {
        priceMap[svc.id] = svc.price > 0 ? svc.price.toFixed(2) : ''
      }

      if (!cancelled) {
        setAppt(apptData as unknown as ApptDetail)
        setServices(mapped)
        setServicePrices(priceMap)
        setPayments((payData ?? []).map(p => ({
          id: p.id as string,
          created_at: p.created_at as string,
          amount: (p.amount as number) ?? 0,
          method: (p.method as string) ?? '',
        })))
        setLoading(false)
      }
    }

    fetchData()
    return () => { cancelled = true }
  }, [id, refreshTick])

  useEffect(() => {
    const salonId = appt?.salon_id
    if (!salonId) return
    let cancelled = false

    supabase.from('services')
      .select('id, name, price')
      .eq('salon_id', salonId)
      .eq('is_active', true)
      .order('name', { ascending: true })
      .then(({ data }) => {
        if (cancelled || !data) return
        setAllServices(data.map(s => ({ id: s.id as string, name: s.name as string, price: (s.price as number) ?? 0 })))
      })

    supabase.from('staff')
      .select('id, name')
      .eq('salon_id', salonId)
      .eq('is_active', true)
      .neq('role', 'owner')
      .order('name', { ascending: true })
      .then(({ data }) => {
        if (cancelled || !data) return
        setAllStaff(data.map(s => ({ id: s.id as string, name: s.name as string })))
      })

    return () => { cancelled = true }
  }, [appt?.salon_id])

  useEffect(() => {
    if (!showBlindBox) return;
    const timer = setTimeout(() => {
      const area = document.getElementById('bbScratchArea');
      const canvas = document.getElementById('bbScratchCanvas') as HTMLCanvasElement;
      if (!area || !canvas) return;
      const w = area.offsetWidth;
      const h = area.offsetHeight;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#E8C84A');
      grad.addColorStop(0.3, '#F5D96B');
      grad.addColorStop(0.6, '#C9A227');
      grad.addColorStop(1, '#E8C84A');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(150,100,0,0.5)';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SCRATCH HERE', w/2, h/2 - 6);
      ctx.font = '11px sans-serif';
      ctx.fillStyle = 'rgba(150,100,0,0.4)';
      ctx.fillText('Your reward is hidden below', w/2, h/2 + 14);
      ctx.globalCompositeOperation = 'destination-out';
      let isScratching = false;
      let revealed = false;
      function getPos(e: MouseEvent | TouchEvent) {
        const rect = canvas.getBoundingClientRect();
        const touch = (e as TouchEvent).touches ? (e as TouchEvent).touches[0] : e as MouseEvent;
        return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
      }
      function scratch(x: number, y: number) {
        ctx.beginPath();
        ctx.arc(x, y, 28, 0, Math.PI * 2);
        ctx.fill();
        if (revealed) return;
        const data = ctx.getImageData(0, 0, w, h).data;
        let cleared = 0;
        for (let i = 3; i < data.length; i += 4) { if (data[i] === 0) cleared++; }
        if (cleared / (w * h) > 0.45) {
          revealed = true;
          setTimeout(() => {
            canvas.style.transition = 'opacity 0.5s';
            canvas.style.opacity = '0';
            const hint = document.getElementById('bbHint');
            const expiry = document.getElementById('bbExpiry');
            const useBtn = document.getElementById('bbUseNow');
            const saveBtn = document.getElementById('bbSaveLater');
            if (hint) hint.style.display = 'none';
            if (expiry) expiry.style.opacity = '1';
            if (useBtn) useBtn.style.opacity = '1';
            if (saveBtn) saveBtn.style.opacity = '1';
          }, 200);
        }
      }
      canvas.addEventListener('mousedown', (e) => { isScratching = true; const p = getPos(e); scratch(p.x, p.y); });
      canvas.addEventListener('mousemove', (e) => { if (isScratching) { const p = getPos(e); scratch(p.x, p.y); } });
      canvas.addEventListener('mouseup', () => isScratching = false);
      canvas.addEventListener('touchstart', (e) => { e.preventDefault(); isScratching = true; const p = getPos(e); scratch(p.x, p.y); }, { passive: false });
      canvas.addEventListener('touchmove', (e) => { e.preventDefault(); if (isScratching) { const p = getPos(e); scratch(p.x, p.y); } }, { passive: false });
      canvas.addEventListener('touchend', () => isScratching = false);
    }, 100);
    return () => clearTimeout(timer);
  }, [showBlindBox]);

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

  async function creditLoyaltyPoints(
    clientId: string,
    salonId: string,
    appointmentId: string,
    amountPaid: number,
    isAppBooking: boolean
  ) {
    const { data: cfg } = await supabase
      .from('loyalty_config')
      .select('*')
      .eq('salon_id', salonId)
      .eq('is_active', true)
      .maybeSingle();
    if (!cfg) return;

    const { data: client } = await supabase
      .from('clients')
      .select('loyalty_points')
      .eq('id', clientId)
      .single();
    if (!client) return;

    const currentPoints = (client.loyalty_points as number) || 0;

    const proThreshold = cfg.pro_threshold as number;
    const maxThreshold = cfg.max_threshold as number;
    const tier = currentPoints >= maxThreshold ? 'max' : currentPoints >= proThreshold ? 'pro' : 'regular';

    const pct = tier === 'max' ? (cfg.max_service_pct as number)
      : tier === 'pro' ? (cfg.pro_service_pct as number)
      : (cfg.regular_service_pct as number);

    const earnedPoints = Math.round((amountPaid * pct / 100) * 100) / 100;

    const ledgerRows: object[] = [];

    if (earnedPoints > 0) {
      ledgerRows.push({
        salon_id: salonId,
        client_id: clientId,
        type: 'spend',
        points: Math.round(earnedPoints),
        reason: 'service_payment',
        reference_id: appointmentId,
      });
    }

    if (isAppBooking && cfg.bp_app_booking) {
      ledgerRows.push({
        salon_id: salonId,
        client_id: clientId,
        type: 'behaviour',
        points: cfg.bp_app_booking as number,
        reason: 'app_booking',
        reference_id: appointmentId,
      });
    }

    if (ledgerRows.length === 0) return;

    await supabase.from('loyalty_points_ledger').insert(ledgerRows);

    const totalNewPoints = ledgerRows.reduce((s, r: any) => s + r.points, 0);
    await supabase.from('clients').update({
      loyalty_points: currentPoints + totalNewPoints,
    }).eq('id', clientId);
  }

  async function creditPreBookPoints(clientId: string, salonId: string, appointmentId: string) {
    const { data: cfg } = await supabase
      .from('loyalty_config')
      .select('is_active, bp_pre_book')
      .eq('salon_id', salonId)
      .eq('is_active', true)
      .maybeSingle();
    if (!cfg || !cfg.bp_pre_book) return;

    const { data: client } = await supabase
      .from('clients')
      .select('loyalty_points')
      .eq('id', clientId)
      .single();
    if (!client) return;

    const currentPoints = (client.loyalty_points as number) || 0;

    await supabase.from('loyalty_points_ledger').insert({
      salon_id: salonId,
      client_id: clientId,
      type: 'behaviour',
      points: cfg.bp_pre_book as number,
      reason: 'pre_book',
      reference_id: appointmentId,
    });

    await supabase.from('clients').update({
      loyalty_points: currentPoints + (cfg.bp_pre_book as number),
    }).eq('id', clientId);
  }

  async function handleCollectPayment() {
    if (!appt) return
    setSaving(true)

    await Promise.all(services.map(s =>
      supabase.from('appointment_services')
        .update({ price: parseFloat(servicePrices[s.id] || '0') || 0 })
        .eq('id', s.id)
    ))

    const entered = parseFloat(payAmount)
    if (isNaN(entered) || entered <= 0) { setSaving(false); return }
    const amount = Math.min(entered, balance)

    const { error: payErr } = await supabase.from('payments').insert({
      salon_id: appt.salon_id,
      appointment_id: appt.id,
      client_id: appt.client_id,
      amount,
      method: payMethod,
      status: 'completed',
    })
    if (!payErr) {
      const newBalance = Math.round((balance - amount) * 100) / 100
      if (newBalance <= 0) {
        await supabase.from('appointments').update({ status: 'completed' }).eq('id', appt.id)
      }
      await creditLoyaltyPoints(
        appt.client_id as string,
        appt.salon_id as string,
        appt.id as string,
        amount,
        false
      );
      setSaving(false)
      navigate('/dashboard')
      return
    }
    setSaving(false)
    setPayAmount('')
    refresh()
  }

  async function checkBlindBoxTrigger(newServiceCount: number) {
    if (!appt || !appt.salon_id) return;
    const { data: campaign } = await supabase
      .from('blind_box_campaigns')
      .select('id, name, price, reward_type, discount_value, prize_validity_days, trigger_at_service, eligible_tiers')
      .eq('salon_id', appt.salon_id)
      .eq('is_active', true)
      .maybeSingle();
    if (!campaign) return;
    if (newServiceCount !== campaign.trigger_at_service) return;
    const { data: pool } = await supabase
      .from('blind_box_prize_pool')
      .select('service_id, services(id, name)')
      .eq('campaign_id', campaign.id);
    if (!pool || pool.length === 0) return;
    const random = pool[Math.floor(Math.random() * pool.length)];
    const svcArr = random.services as unknown as { id: string; name: string }[];
    const svc = Array.isArray(svcArr) ? svcArr[0] : svcArr as unknown as { id: string; name: string };
    setBbCampaign(campaign);
    setBbRevealedService(svc);
    setShowBlindBox(true);
  }

  async function handleBBChoice(choice: 'use_now' | 'save') {
    if (!bbCampaign || !bbRevealedService || !appt || !appt.salon_id) return;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + bbCampaign.prize_validity_days);
    const expiryStr = expiresAt.toISOString().split('T')[0];
    const catPrice = bbRevealedService ? (await supabase.from('services').select('price').eq('id', bbRevealedService.id).single()).data?.price || 0 : 0;
    const discountedPrice = bbCampaign.reward_type === 'free' ? 0
      : bbCampaign.reward_type === 'percentage' ? catPrice * (1 - bbCampaign.discount_value / 100)
      : bbCampaign.reward_type === 'fixed_aed' ? Math.max(0, catPrice - bbCampaign.discount_value)
      : 0;
    await supabase.from('blind_box_rewards').insert({
      salon_id: appt.salon_id,
      campaign_id: bbCampaign.id,
      client_id: appt.client_id,
      appointment_id: appt.id,
      service_id: bbRevealedService.id,
      bb_fee_paid: bbCampaign.price,
      catalogue_price: catPrice,
      discounted_price: discountedPrice,
      status: choice === 'use_now' ? 'redeemed_now' : 'saved',
      expires_at: expiryStr,
    });
    if (choice === 'use_now') {
      await supabase.from('appointment_services').insert({
        appointment_id: appt.id,
        service_id: bbRevealedService.id,
        staff_id: addStaffId,
        price: discountedPrice,
        status: 'pending',
      });
      await supabase.from('payments').insert({
        salon_id: appt.salon_id,
        appointment_id: appt.id,
        client_id: appt.client_id,
        amount: bbCampaign.price,
        method: 'cash',
        status: 'completed',
        reference: 'blind_box',
      });
    }
    setShowBlindBox(false);
    setBbCampaign(null);
    setBbRevealedService(null);
    refresh();
  }

  async function handleAddService() {
    if (!appt) return
    if (!addSvcId || !addStaffId) return
    const priceNum = parseFloat(addPrice)
    if (isNaN(priceNum) || priceNum < 0) return
    setAddingSvc(true)
    const { error } = await supabase.from('appointment_services').insert({
      appointment_id: appt.id,
      service_id: addSvcId,
      staff_id: addStaffId,
      price: priceNum,
      status: 'pending',
    })
    if (error) {
      console.error('[AppointmentDetail] handleAddService error:', error)
      setAddingSvc(false)
      return
    }
    setAddSvcId('')
    setAddStaffId('')
    setAddPrice('')
    setAddingSvc(false)
    refresh()
    await checkBlindBoxTrigger(services.length + 1);
  }

  function triggerPhoto(serviceId: string, field: 'before_photos' | 'after_photos') {
    setPendingPhoto({ serviceId, field })
    setTimeout(() => fileInputRef.current?.click(), 0)
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !pendingPhoto || !appt) return
    setSaving(true)

    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${appt.salon_id}/${appt.id}/${pendingPhoto.serviceId}/${pendingPhoto.field}/${Date.now()}.${ext}`

    const { error: uploadErr } = await supabase.storage.from('appointment-photos').upload(path, file)
    if (uploadErr) { setSaving(false); setFetchErr(uploadErr.message); return }

    const { data: { publicUrl } } = supabase.storage.from('appointment-photos').getPublicUrl(path)

    const svc = services.find(s => s.id === pendingPhoto.serviceId)
    const current = (pendingPhoto.field === 'before_photos' ? svc?.before_photos : svc?.after_photos) ?? []

    await supabase.from('appointment_services')
      .update({ [pendingPhoto.field]: [...current, publicUrl] })
      .eq('id', pendingPhoto.serviceId)

    if (fileInputRef.current) fileInputRef.current.value = ''
    setPendingPhoto(null)
    setSaving(false)
    refresh()
  }

  const allSvcCompleted = services.length > 0 && services.every(s => s.status === 'completed')
  const enteredTotal = services.reduce((sum, s) => sum + (parseFloat(servicePrices[s.id] || '0') || 0), 0)
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)
  const balance = Math.max(0, Math.round((enteredTotal - totalPaid) * 100) / 100)
  const isTerminal = appt?.status === 'cancelled' || appt?.status === 'no_show'
  const isCompleted = appt?.status === 'completed'

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', display: 'flex', flexDirection: 'column' }}>

      <Topbar />

      <div style={{ margin: '52px auto 0', flex: 1, padding: '20px 16px 32px', maxWidth: 680, width: '100%', boxSizing: 'border-box' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button
            onClick={() => navigate(-1)}
            style={{ background: 'transparent', border: '0.5px solid #034325', color: '#034325', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}
          >
            Back
          </button>
          <span style={{ color: '#6b7280', fontSize: 12 }}>Appointment detail</span>
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', padding: 40, color: '#6b7280', fontSize: 12, margin: 0 }}>Loading…</p>
        ) : fetchErr ? (
          <p style={{ textAlign: 'center', padding: 40, color: '#dc2626', fontSize: 12, margin: 0 }}>{fetchErr}</p>
        ) : !appt ? (
          <p style={{ textAlign: 'center', padding: 40, color: '#6b7280', fontSize: 12, margin: 0 }}>Appointment not found.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            <div style={{ backgroundColor: '#034325', borderRadius: 10, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ color: '#00BF00', fontSize: 11, margin: '0 0 4px' }}>
                  {fmtDateTime(appt.starts_at, tz)}
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
              <div style={{ flexShrink: 0, paddingTop: 2, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <ApptStatusBadge status={appt.status} />
                <span style={{
                  fontSize: 12,
                  fontFamily: 'monospace',
                  color: 'var(--color-text-secondary, rgba(255,255,255,0.6))',
                }}>
                  {fmtApptRef(appt.reference_number)}
                </span>
              </div>
            </div>

            {services.map(svc => (
              <ServiceCard
                key={svc.id}
                svc={svc}
                apptStatus={appt.status}
                saving={saving}
                onStart={() => handleStartService(svc.id)}
                onComplete={() => handleCompleteService(svc.id)}
                onNoShow={handleNoShow}
                onCancel={handleCancel}
                onPhoto={field => triggerPhoto(svc.id, field)}
              />
            ))}

            {(appt.status === 'scheduled' || appt.status === 'in_progress') && (
              <div style={{ backgroundColor: '#ffffff', border: '0.5px solid #e0e0e0', borderRadius: 8, padding: 14 }}>
                <p style={{ fontSize: 11, fontWeight: 500, color: '#034325', margin: '0 0 10px' }}>Add service</p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    value={addSvcId}
                    onChange={e => {
                      const nextId = e.target.value
                      setAddSvcId(nextId)
                      const selected = allServices.find(s => s.id === nextId)
                      if (selected && selected.price > 0) setAddPrice(String(selected.price))
                    }}
                    style={{ flex: 2, minWidth: 140, fontSize: 12, color: addSvcId ? '#000000' : '#9ca3af', border: '0.5px solid #e0e0e0', borderRadius: 6, padding: '6px 8px', outline: 'none', cursor: 'pointer', backgroundColor: '#ffffff' }}
                  >
                    <option value="">Select service…</option>
                    {allServices.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <select
                    value={addStaffId}
                    onChange={e => setAddStaffId(e.target.value)}
                    style={{ flex: 2, minWidth: 120, fontSize: 12, color: addStaffId ? '#000000' : '#9ca3af', border: '0.5px solid #e0e0e0', borderRadius: 6, padding: '6px 8px', outline: 'none', cursor: 'pointer', backgroundColor: '#ffffff' }}
                  >
                    <option value="">Select staff…</option>
                    {allStaff.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={addPrice}
                    onChange={e => setAddPrice(e.target.value)}
                    placeholder="Price"
                    style={{ width: 80, fontSize: 12, color: '#000000', border: '0.5px solid #e0e0e0', borderRadius: 6, padding: '6px 8px', outline: 'none', textAlign: 'right', backgroundColor: '#ffffff' }}
                  />
                  <button
                    onClick={handleAddService}
                    disabled={addingSvc || !addSvcId || !addStaffId || !addPrice.trim()}
                    style={{
                      backgroundColor: 'transparent',
                      color: '#034325',
                      border: '0.5px solid #034325',
                      borderRadius: 6,
                      padding: '6px 14px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: addingSvc || !addSvcId || !addStaffId || !addPrice.trim() ? 'not-allowed' : 'pointer',
                      opacity: addingSvc || !addSvcId || !addStaffId || !addPrice.trim() ? 0.5 : 1,
                    }}
                  >
                    {addingSvc ? '…' : 'Add'}
                  </button>
                </div>
              </div>
            )}

            {(!allSvcCompleted || isTerminal) ? (
              <div style={{ border: '0.5px solid #e0e0e0', borderRadius: 8, padding: '14px 16px', opacity: 0.5 }}>
                <p style={{ fontSize: 12, color: '#9ca3af', margin: 0, textAlign: 'center' }}>
                  Payment — available after all services complete
                </p>
              </div>
            ) : (
              <div style={{ backgroundColor: '#ffffff', border: '0.5px solid #e0e0e0', borderRadius: 8, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '0 0 12px' }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#034325', margin: 0 }}>Payment</p>
                  <span style={{
                    fontSize: 12,
                    fontFamily: 'monospace',
                    color: 'var(--color-text-secondary, #6b7280)',
                  }}>
                    {fmtApptRef(appt.reference_number)}
                  </span>
                </div>

                {services.map(svc => (
                  <div key={svc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '0.5px solid #f0f0f0', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#6b7280', flex: 1 }}>{svc.serviceName}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>AED</span>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={servicePrices[svc.id] ?? ''}
                        onChange={e => !isCompleted && setServicePrices(prev => ({ ...prev, [svc.id]: e.target.value }))}
                        readOnly={isCompleted}
                        placeholder="0.00"
                        style={{ width: 72, fontSize: 12, fontWeight: 500, color: '#034325', border: '0.5px solid #e0e0e0', borderRadius: 4, padding: '4px 6px', outline: 'none', textAlign: 'right', backgroundColor: isCompleted ? '#f9fafb' : '#ffffff' }}
                      />
                    </div>
                  </div>
                ))}

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 12px', borderTop: '0.5px solid #e0e0e0', marginTop: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#000000' }}>Total</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#034325' }}>AED {enteredTotal.toFixed(2)}</span>
                </div>

                <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 6px' }}>Payments collected</p>
                {payments.length === 0 ? (
                  <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 10px' }}>No payments yet</p>
                ) : (
                  <div style={{ marginBottom: 10 }}>
                    {payments.map(p => (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '0.5px solid #f0f0f0' }}>
                        <span style={{ fontSize: 11, color: '#6b7280' }}>{fmtDateTime(p.created_at, tz)}</span>
                        <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 3, backgroundColor: '#f9fafb', border: '0.5px solid #e0e0e0', color: '#6b7280' }}>
                          {p.method === 'cash' ? 'Cash' : 'Card'}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 500, color: '#034325' }}>AED {p.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 0', borderTop: '0.5px solid #e0e0e0', marginBottom: balance > 0 ? 12 : 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#000000' }}>Balance</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: balance > 0 ? '#991b1b' : '#034325' }}>
                    {balance > 0 ? `AED ${balance.toFixed(2)} remaining` : 'Paid in full'}
                  </span>
                </div>

                {balance > 0 && (
                  <>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 10, color: '#6b7280', display: 'block', marginBottom: 4 }}>Amount</label>
                        <input
                          type="number"
                          min={0.01}
                          max={balance}
                          step={0.01}
                          value={payAmount}
                          onChange={e => setPayAmount(e.target.value)}
                          placeholder={balance.toFixed(2)}
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
                  </>
                )}
              </div>
            )}

          </div>
        )}
      </div>

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

      {showBlindBox && bbRevealedService && bbCampaign && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: 320, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ background: '#034325', padding: '18px 20px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: '#C9A227', textTransform: 'uppercase', marginBottom: 4 }}>{bbCampaign.name}</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>Your Blind Box</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>Scratch to reveal your reward</div>
            </div>
            <div style={{ position: 'relative', height: 180, margin: 20, borderRadius: 10, overflow: 'hidden', cursor: 'crosshair' }} id="bbScratchArea">
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', background: '#faeeda', borderRadius: 10 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#034325', textAlign: 'center', padding: '0 16px' }}>{bbRevealedService.name}</div>
              </div>
              <canvas id="bbScratchCanvas" style={{ position: 'absolute', inset: 0, borderRadius: 10, touchAction: 'none' }} />
            </div>
            <div style={{ textAlign: 'center', fontSize: 11, color: '#888', margin: '-8px 0 12px' }} id="bbHint">Scratch with your finger</div>
            <div style={{ textAlign: 'center', fontSize: 11, color: '#888', padding: '0 20px 16px', opacity: 0, transition: 'opacity 0.4s' }} id="bbExpiry">
              Valid until {(() => { const d = new Date(); d.setDate(d.getDate() + bbCampaign.prize_validity_days); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); })()}  if saved for later
            </div>
            <div style={{ display: 'flex', gap: 10, padding: '0 20px 20px' }}>
              <button id="bbUseNow" onClick={() => handleBBChoice('use_now')} style={{ flex: 1, background: '#034325', color: '#fff', border: 'none', borderRadius: 8, padding: 12, fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: 0, transition: 'opacity 0.4s' }}>Use now</button>
              <button id="bbSaveLater" onClick={() => handleBBChoice('save')} style={{ flex: 1, background: 'transparent', color: '#034325', border: '1.5px solid #034325', borderRadius: 8, padding: 12, fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: 0, transition: 'opacity 0.4s' }}>Save for later</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}