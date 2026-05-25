import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const CLIENT_COUNTRY_CODES = [
  { flag: '🇦🇪', code: '+971' },
  { flag: '🇸🇦', code: '+966' },
  { flag: '🇰🇼', code: '+965' },
  { flag: '🇶🇦', code: '+974' },
  { flag: '🇧🇭', code: '+973' },
  { flag: '🇴🇲', code: '+968' },
  { flag: '🇮🇳', code: '+91'  },
  { flag: '🇬🇧', code: '+44'  },
  { flag: '🇺🇸', code: '+1'   },
]

interface Salon {
  id: string
  name: string
  city: string | null
  country: string | null
}

interface Client {
  id: string
  name: string
  phone: string
}

interface Service {
  id: string
  name: string
  category: string | null
  duration_minutes: number
  price: number
  is_active: boolean
  commission_pct?: number
  image_url?: string | null
}

interface StaffMember {
  id: string
  name: string
  role: string
}

type DayConfig = { open: boolean; from: string; to: string }
type Screen = 'login' | 'home' | 'change-pin' | 'book-staff' | 'book-service' | 'book-datetime' | 'book-confirm' | 'my-profile' | 'upcoming' | 'history' | 'reviews'

interface UpcomingAppt {
  id: string
  reference_number: number | null
  starts_at: string
  status: string
  staffName: string | null
  services: string[]
}

interface HistoryAppt {
  id: string
  reference_number: number | null
  starts_at: string
  status: string
  staffName: string | null
  services: string[]
  amountPaid: number
}

interface PendingReview {
  id: string
  reference_number: number | null
  starts_at: string
  staff_id: string | null
  staffName: string | null
  services: string[]
}

interface SubmittedReview {
  id: string
  appointment_id: string | null
  reference_number: number | null
  starts_at: string | null
  salon_rating: number
  staff_rating: number
  comment: string | null
}
type BookingFlow = 'by-time' | 'by-staff' | null

function getTomorrow(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function initials(name: string): string {
  const parts = name.trim().split(' ').filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return (parts[0][0] ?? '?').toUpperCase()
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase()
}

function fmtDubaiDateTime(iso: string): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hour12: false })
  return `${date} · ${time}`
}

function generateSlots(date: string, hours: Record<string, DayConfig> | null): string[] {
  if (!date) return []
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const dayName = days[new Date(date + 'T12:00:00').getDay()]
  const day = hours?.[dayName]
  if (day && !day.open) return []
  const from = day?.from ?? '10:00'
  const to = day?.to ?? '22:00'
  const [fromH = 10, fromM = 0] = from.split(':').map(Number)
  const [toH = 22, toM = 0] = to.split(':').map(Number)
  const slots: string[] = []
  let cur = fromH * 60 + fromM
  const end = toH * 60 + toM
  while (cur < end) {
    slots.push(`${String(Math.floor(cur / 60)).padStart(2, '0')}:${String(cur % 60).padStart(2, '0')}`)
    cur += 60
  }
  return slots
}

const headerStyle: React.CSSProperties = {
  backgroundColor: '#034325',
  padding: '14px 16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexShrink: 0,
}

const screenWrap: React.CSSProperties = {
  minHeight: '100vh',
  backgroundColor: '#f9fafb',
  display: 'flex',
  flexDirection: 'column',
  maxWidth: 480,
  margin: '0 auto',
  width: '100%',
}

export default function ClientApp() {
  const { slug } = useParams<{ slug: string }>()

  const [salon, setSalon]                 = useState<Salon | null>(null)
  const [salonLoading, setSalonLoading]   = useState(true)
  const [salonNotFound, setSalonNotFound] = useState(false)

  const [countryCode, setCountryCode] = useState('+971')
  const [phone, setPhone]             = useState('')
  const [pin, setPin]                 = useState(['', '', '', '', ''])
  const pinRefs = useRef<(HTMLInputElement | null)[]>([])

  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopyLink = () => {
    const url = `noorie-salon.vercel.app/${slug}/client`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const [currentScreen, setCurrentScreen] = useState<Screen>('login')
  const [client, setClient]               = useState<Client | null>(null)

  const [services, setServices]                           = useState<Service[]>([])
  const [staff, setStaff]                                 = useState<StaffMember[]>([])
  const [operatingHours, setOperatingHours]               = useState<Record<string, DayConfig> | null>(null)
  const [staffFilteredServices, setStaffFilteredServices] = useState<Service[] | null>(null)
  const [selectedService, setSelectedService]             = useState<Service | null>(null)
  const [selectedDate, setSelectedDate]                   = useState<string>('')
  const [selectedTime, setSelectedTime]                   = useState<string>('')
  const [selectedStaff, setSelectedStaff]                 = useState<StaffMember | null>(null)
  const [bookingRef, setBookingRef]                       = useState<string>('')
  const [bookingLoading, setBookingLoading]               = useState(false)
  const [bookingError, setBookingError]                   = useState('')
  const [menuOpen, setMenuOpen]                           = useState(false)
  const [showBookingModal, setShowBookingModal]           = useState(false)
  const [bookingFlow, setBookingFlow]                     = useState<BookingFlow>(null)
  const [availableSlots, setAvailableSlots]               = useState<string[]>([])
  const [slotsLoading, setSlotsLoading]                   = useState(false)

  const [changePinNew, setChangePinNew]         = useState(['', '', '', '', ''])
  const [changePinConfirm, setChangePinConfirm] = useState(['', '', '', '', ''])
  const changePinNewRefs     = useRef<(HTMLInputElement | null)[]>([])
  const changePinConfirmRefs = useRef<(HTMLInputElement | null)[]>([])
  const [changePinError, setChangePinError]     = useState('')
  const [changePinLoading, setChangePinLoading] = useState(false)

  const [profileName, setProfileName]       = useState('')
  const [profileEmail, setProfileEmail]     = useState('')
  const [profileDob, setProfileDob]         = useState('')
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSaving, setProfileSaving]   = useState(false)
  const [profileError, setProfileError]     = useState('')

  const [upcomingAppts, setUpcomingAppts]     = useState<UpcomingAppt[]>([])
  const [upcomingLoading, setUpcomingLoading] = useState(false)

  const [inventoryProducts, setInventoryProducts] = useState<{ id: string; name: string; price: number | null; stock_count: number; image_url: string | null }[]>([])
  const [inventoryError, setInventoryError] = useState<string | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<{ id: string; name: string; price: number | null; stock_count: number; image_url: string | null } | null>(null)
  const [selectedPackage, setSelectedPackage] = useState<Service | null>(null)

  const [historyAppts, setHistoryAppts]       = useState<HistoryAppt[]>([])
  const [historyLoading, setHistoryLoading]   = useState(false)

  const [pendingReviews, setPendingReviews]     = useState<PendingReview[]>([])
  const [submittedReviews, setSubmittedReviews] = useState<SubmittedReview[]>([])
  const [reviewsLoading, setReviewsLoading]     = useState(false)
  const [expandedAppt, setExpandedAppt]         = useState<string | null>(null)
  const [reviewSalonRating, setReviewSalonRating]   = useState(0)
  const [reviewStaffRating, setReviewStaffRating]   = useState(0)
  const [reviewComment, setReviewComment]           = useState('')
  const [reviewSubmitting, setReviewSubmitting]     = useState(false)
  const [reviewError, setReviewError]               = useState('')

  useEffect(() => {
    if (!slug) return
    fetch('https://eoxgaawoyftjnjkmjbmk.supabase.co/functions/v1/get-salon-by-slug', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    })
      .then(res => res.json())
      .then(data => {
        if (data && data.id) setSalon(data as Salon)
        else setSalonNotFound(true)
        setSalonLoading(false)
      })
      .catch(() => { setSalonNotFound(true); setSalonLoading(false) })
  }, [slug])

  // Fetch available slots whenever date, staff, or operating hours change on book-datetime
  useEffect(() => {
    if (currentScreen !== 'book-datetime' || !salon || !selectedDate) {
      setAvailableSlots([])
      return
    }
    let cancelled = false
    setSlotsLoading(true)

    const run = async () => {
      const allSlots = generateSlots(selectedDate, operatingHours)
      const from = `${selectedDate}T00:00:00`
      const to   = `${selectedDate}T23:59:59`

      const baseQuery = supabase
        .from('appointments')
        .select('starts_at, ends_at')
        .eq('salon_id', salon.id)
        .gte('starts_at', from)
        .lte('starts_at', to)
        .neq('status', 'cancelled')

      const { data: appts } = await (
        selectedStaff ? baseQuery.eq('staff_id', selectedStaff.id) : baseQuery
      )
      if (cancelled) return

      const booked = new Set<string>()
      for (const appt of appts ?? []) {
        const aStart = new Date(appt.starts_at)
        const aEnd   = new Date(appt.ends_at)
        const aSM    = aStart.getHours() * 60 + aStart.getMinutes()
        const aEM    = aEnd.getHours()   * 60 + aEnd.getMinutes()
        for (const slot of allSlots) {
          const [h = 0, m = 0] = slot.split(':').map(Number)
          const sM = h * 60 + m
          if (sM < aEM && sM + 60 > aSM) booked.add(slot)
        }
      }

      setAvailableSlots(allSlots.filter(s => !booked.has(s)))
      setSlotsLoading(false)
    }

    run()
    return () => { cancelled = true }
  }, [currentScreen, salon?.id, selectedDate, selectedStaff?.id, operatingHours])

  useEffect(() => {
    if (currentScreen !== 'my-profile' || !client) return
    setProfileLoading(true)
    setProfileError('')
    supabase
      .from('clients')
      .select('name, phone, email, dob')
      .eq('id', client.id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) { setProfileError('Failed to load profile'); setProfileLoading(false); return }
        setProfileName((data.name as string) ?? '')
        setProfileEmail((data.email as string) ?? '')
        setProfileDob((data.dob as string) ?? '')
        setProfileLoading(false)
      })
  }, [currentScreen, client?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentScreen !== 'upcoming' || !client) return
    setUpcomingLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase
      .from('appointments')
      .select('id, reference_number, starts_at, status, staff:staff_id(name), appointment_services(services(name))')
      .eq('client_id', client.id)
      .eq('status', 'scheduled')
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
      .then(({ data }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const appts: UpcomingAppt[] = (data ?? []).map((a: any) => ({
          id: a.id,
          reference_number: a.reference_number,
          starts_at: a.starts_at,
          status: a.status,
          staffName: a.staff?.name ?? null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          services: (a.appointment_services ?? []).map((s: any) => s.services?.name).filter(Boolean),
        }))
        setUpcomingAppts(appts)
        setUpcomingLoading(false)
      })
  }, [currentScreen, client?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentScreen !== 'history' || !client) return
    setHistoryLoading(true)
    supabase
      .from('appointments')
      .select('id, reference_number, starts_at, status, staff:staff_id(name), appointment_services(services(name)), payments(amount)')
      .eq('client_id', client.id)
      .in('status', ['completed', 'cancelled', 'no_show'])
      .order('starts_at', { ascending: false })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const appts: HistoryAppt[] = (data ?? []).map((a: any) => ({
          id: a.id,
          reference_number: a.reference_number,
          starts_at: a.starts_at,
          status: a.status,
          staffName: a.staff?.name ?? null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          services: (a.appointment_services ?? []).map((s: any) => s.services?.name).filter(Boolean),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          amountPaid: (a.payments ?? []).reduce((sum: number, p: any) => sum + (p.amount ?? 0), 0),
        }))
        setHistoryAppts(appts)
        setHistoryLoading(false)
      })
  }, [currentScreen, client?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentScreen !== 'reviews' || !client || !salon) return
    setReviewsLoading(true)
    Promise.all([
      supabase
        .from('reviews')
        .select('id, appointment_id, salon_rating, staff_rating, comment, appointments(reference_number, starts_at)')
        .eq('client_id', client.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('appointments')
        .select('id, reference_number, starts_at, staff_id, staff:staff_id(name), appointment_services(services(name))')
        .eq('client_id', client.id)
        .eq('status', 'completed')
        .order('starts_at', { ascending: false }),
    ]).then(([{ data: reviewData }, { data: apptData }]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const submitted: SubmittedReview[] = (reviewData ?? []).map((r: any) => ({
        id: r.id,
        appointment_id: r.appointment_id,
        reference_number: r.appointments?.reference_number ?? null,
        starts_at: r.appointments?.starts_at ?? null,
        salon_rating: r.salon_rating,
        staff_rating: r.staff_rating,
        comment: r.comment,
      }))
      const reviewedApptIds = new Set(submitted.map(r => r.appointment_id).filter(Boolean))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pending: PendingReview[] = (apptData ?? []).filter((a: any) => !reviewedApptIds.has(a.id)).map((a: any) => ({
        id: a.id,
        reference_number: a.reference_number,
        starts_at: a.starts_at,
        staff_id: a.staff_id,
        staffName: a.staff?.name ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        services: (a.appointment_services ?? []).map((s: any) => s.services?.name).filter(Boolean),
      }))
      setSubmittedReviews(submitted)
      setPendingReviews(pending)
      setReviewsLoading(false)
    })
  }, [currentScreen, client?.id, salon?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmitReview = async (appt: PendingReview) => {
    if (!client || !salon) return
    if (reviewSalonRating === 0 || reviewStaffRating === 0) { setReviewError('Please select both ratings'); return }
    setReviewSubmitting(true)
    setReviewError('')
    const { error } = await supabase.from('reviews').insert({
      salon_id: salon.id,
      client_id: client.id,
      appointment_id: appt.id,
      staff_id: appt.staff_id,
      salon_rating: reviewSalonRating,
      staff_rating: reviewStaffRating,
      comment: reviewComment.trim() || null,
    })
    if (error) { setReviewError(error.message); setReviewSubmitting(false); return }
    const newReview: SubmittedReview = {
      id: crypto.randomUUID(),
      appointment_id: appt.id,
      reference_number: appt.reference_number,
      starts_at: appt.starts_at,
      salon_rating: reviewSalonRating,
      staff_rating: reviewStaffRating,
      comment: reviewComment.trim() || null,
    }
    setPendingReviews(prev => prev.filter(p => p.id !== appt.id))
    setSubmittedReviews(prev => [newReview, ...prev])
    setExpandedAppt(null)
    setReviewSalonRating(0)
    setReviewStaffRating(0)
    setReviewComment('')
    setReviewSubmitting(false)
  }

  const handlePinChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return
    const next = [...pin]; next[index] = value; setPin(next)
    if (value && index < 4) pinRefs.current[index + 1]?.focus()
  }
  const handlePinKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) pinRefs.current[index - 1]?.focus()
  }

  const handleChangePinNewChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return
    const next = [...changePinNew]; next[index] = value; setChangePinNew(next)
    if (value && index < 4) changePinNewRefs.current[index + 1]?.focus()
  }
  const handleChangePinNewKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !changePinNew[index] && index > 0) changePinNewRefs.current[index - 1]?.focus()
  }

  const handleChangePinConfirmChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return
    const next = [...changePinConfirm]; next[index] = value; setChangePinConfirm(next)
    if (value && index < 4) changePinConfirmRefs.current[index + 1]?.focus()
  }
  const handleChangePinConfirmKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !changePinConfirm[index] && index > 0) changePinConfirmRefs.current[index - 1]?.focus()
  }

  const handleChangePin = async () => {
    const np = changePinNew.join('')
    const cp = changePinConfirm.join('')
    if (np.length < 5) { setChangePinError('Please enter a 5-digit PIN'); return }
    if (np !== cp) { setChangePinError('PINs do not match'); return }
    if (!client) return
    setChangePinLoading(true); setChangePinError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('https://eoxgaawoyftjnjkmjbmk.supabase.co/functions/v1/client-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPin: np, access_token: session?.access_token }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error ?? 'Failed to change PIN')
      fetch('https://eoxgaawoyftjnjkmjbmk.supabase.co/functions/v1/create-client-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ clientId: client.id, phone: client.phone, pin: np }),
      }).catch(() => {})
      setChangePinNew(['', '', '', '', ''])
      setChangePinConfirm(['', '', '', '', ''])
      setCurrentScreen('home')
    } catch (err: unknown) {
      setChangePinError(err instanceof Error ? err.message : 'Failed to change PIN')
    } finally {
      setChangePinLoading(false)
    }
  }

  const handleProfileSave = async () => {
    if (!client) return
    setProfileSaving(true)
    setProfileError('')
    const { error } = await supabase
      .from('clients')
      .update({ name: profileName.trim(), email: profileEmail.trim() || null, dob: profileDob || null })
      .eq('id', client.id)
    if (error) { setProfileError(error.message); setProfileSaving(false); return }
    setClient(prev => prev ? { ...prev, name: profileName.trim() } : prev)
    setCurrentScreen('home')
  }

  const doSignOut = () => {
    setClient(null); setPin(['', '', '', '', '']); setPhone('')
    setServices([]); setStaff([]); setOperatingHours(null)
    setStaffFilteredServices(null); setSelectedService(null)
    setSelectedDate(''); setSelectedTime(''); setSelectedStaff(null)
    setBookingRef(''); setMenuOpen(false); setShowBookingModal(false)
    setBookingFlow(null); setAvailableSlots([])
    setChangePinNew(['', '', '', '', '']); setChangePinConfirm(['', '', '', '', ''])
    setChangePinError(''); setCurrentScreen('login')
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault(); setError('')
    const enteredPin = pin.join('')
    if (enteredPin.length < 5) { setError('Please enter your 5-digit PIN'); return }
    setLoading(true)
    try {
      const res = await fetch('https://eoxgaawoyftjnjkmjbmk.supabase.co/functions/v1/client-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, countryCode, phone, pin: enteredPin }),
      })
      const result = await res.json()
      if (!res.ok) {
        if (res.status === 401) { setError('Incorrect PIN'); return }
        if (res.status === 404) { setError('Phone number not registered. Please ask the salon to add you.'); return }
        throw new Error(result.error ?? 'Sign in failed')
      }
      if (!result.session) throw new Error('Login succeeded but no session returned. Please try again.')

      try {
        const { error: sessionError } = await supabase.auth.setSession(result.session)
        if (sessionError) throw sessionError
        setClient({ id: result.client.id, name: result.client.name, phone: result.client.phone })

        const { data: staffData } = await supabase.rpc('get_staff_for_salon', {
          p_salon_id: result.salonId,
        })
        setStaff((staffData as StaffMember[]) ?? [])

        const { data: svcData } = await supabase
          .from('services')
          .select('id, name, category, duration_minutes, price, is_active, image_url')
          .eq('salon_id', salon!.id)
          .eq('is_active', true)
          .order('category')
        setServices((svcData as Service[]) ?? [])

        const { data: configData } = await supabase
          .from('salon_config')
          .select('operating_hours')
          .eq('salon_id', salon!.id)
          .maybeSingle()
        setOperatingHours((configData?.operating_hours as Record<string, DayConfig>) ?? null)

        const { data: invData, error: invError } = await supabase
          .from('inventory_items')
          .select('id, name, price, stock_count, image_url')
          .eq('salon_id', salon!.id)
          .eq('type', 'product')
          .eq('is_active', true)
          .order('name')
        if (invError) {
          console.error('Products fetch error:', invError)
          setInventoryError('Could not load products')
        } else {
          setInventoryProducts((invData ?? []) as { id: string; name: string; price: number | null; stock_count: number; image_url: string | null }[])
        }

        setSelectedDate(getTomorrow())
        setCurrentScreen('home')
      } catch (postLoginErr: unknown) {
        setError(postLoginErr instanceof Error ? postLoginErr.message : 'Post-login setup failed. Please try again.')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleBook = async () => {
    if (!selectedService || !salon || !client) return
    setBookingLoading(true); setBookingError('')
    try {
      const date = selectedDate || getTomorrow()
      const time = selectedTime || '10:00'
      const starts_at = `${date}T${time}:00+04:00`
      const [h, m] = time.split(':').map(Number)
      const totalMins = h * 60 + m + selectedService.duration_minutes
      const ends_at = `${date}T${String(Math.floor(totalMins / 60)).padStart(2, '0')}:${String(totalMins % 60).padStart(2, '0')}:00+04:00`

      const { data: apptData, error: apptErr } = await supabase
        .from('appointments')
        .insert({ salon_id: salon.id, client_id: client.id, staff_id: selectedStaff?.id ?? null, status: 'scheduled', starts_at, ends_at, notes: null, is_walk_in: false })
        .select('id, reference_number')
        .single()
      if (apptErr || !apptData) throw apptErr ?? new Error('Booking failed')

      const { error: svcErr } = await supabase
        .from('appointment_services')
        .insert({ appointment_id: apptData.id, service_id: selectedService.id, staff_id: selectedStaff?.id ?? null, price: 0, commission_pct: selectedService.commission_pct ?? 0, status: 'pending' })
      if (svcErr) throw svcErr

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const refNum = (apptData as any).reference_number
      setBookingRef(refNum ? `APT-${String(refNum).padStart(4, '0')}` : `APT-${apptData.id.slice(0, 8).toUpperCase()}`)
      setCurrentScreen('book-confirm')
    } catch (err: unknown) {
      setBookingError(err instanceof Error ? err.message : 'Booking failed. Please try again.')
    } finally {
      setBookingLoading(false)
    }
  }

  const blueFooter = (
    <div style={{ textAlign: 'center', padding: '8px 0' }}>
      <img src="/assets/logo-WyJseHTl.png" alt="Blue Flute" style={{ width: 60, display: 'block', margin: '0 auto 6px' }} />
      <p style={{ fontSize: 10, color: '#9ca3af', margin: 0 }}>Powered by Blue Flute Consulting LLC-FZ</p>
    </div>
  )

  // ── Loading / not found ────────────────────────────────────────────────────

  if (salonLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' }}>
        <p style={{ color: '#6b7280', fontSize: 13 }}>Loading...</p>
      </div>
    )
  }

  if (salonNotFound) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' }}>
        <p style={{ color: '#991b1b', fontSize: 14, textAlign: 'center' }}>Salon not found.</p>
      </div>
    )
  }

  // ── Hamburger menu overlay ─────────────────────────────────────────────────

  const menuOverlay = menuOpen && (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={() => setMenuOpen(false)}>
      <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)' }} />
      <div
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 280, backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 16px rgba(0,0,0,0.15)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ ...headerStyle, padding: '14px 16px' }}>
          <p style={{ color: '#ffffff', fontSize: 14, fontWeight: 700, margin: 0 }}>{salon?.name}</p>
          <button onClick={() => setMenuOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ffffff', fontSize: 20, lineHeight: 1, padding: 4 }}>X</button>
        </div>
        <div style={{ padding: '16px', borderBottom: '0.5px solid #e0e0e0', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: '#034325', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ color: '#ffffff', fontSize: 16, fontWeight: 700 }}>{client ? initials(client.name) : '?'}</span>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#111' }}>{client?.name}</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>{client?.phone}</p>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {(['My profile', 'Upcoming'] as const).map(label => (
            <button
              key={label}
              onClick={() => { setMenuOpen(false); setCurrentScreen(label === 'My profile' ? 'my-profile' : 'upcoming') }}
              style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: '0.5px solid #e0e0e0', padding: '0 16px', height: 44, fontSize: 13, color: '#111', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >{label}</button>
          ))}
          <button onClick={() => { setMenuOpen(false); setCurrentScreen('history') }} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: '0.5px solid #e0e0e0', padding: '0 16px', height: 44, fontSize: 13, color: '#111', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>Appointment History</button>
          <button onClick={() => { setMenuOpen(false); setCurrentScreen('reviews') }} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: '0.5px solid #e0e0e0', padding: '0 16px', height: 44, fontSize: 13, color: '#111', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>Reviews</button>
          {['Loyalty', 'Contact salon', 'About Noorie'].map(label => (
            <button key={label} onClick={() => alert('Coming soon')} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: '0.5px solid #e0e0e0', padding: '0 16px', height: 44, fontSize: 13, color: '#111', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>{label}</button>
          ))}
          <button onClick={() => { setMenuOpen(false); setCurrentScreen('change-pin') }} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: '0.5px solid #e0e0e0', padding: '0 16px', height: 44, fontSize: 13, color: '#111', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>Change PIN</button>
          <div style={{ height: 1, backgroundColor: '#e0e0e0', margin: '8px 0' }} />
          <button onClick={doSignOut} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: '0.5px solid #e0e0e0', padding: '0 16px', height: 44, fontSize: 13, color: '#111', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>Sign out</button>
          <button onClick={() => alert('Coming soon')} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '0 16px', height: 44, fontSize: 13, color: '#991b1b', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>Delete account</button>
        </div>
      </div>
    </div>
  )

  // ── Booking type modal ─────────────────────────────────────────────────────

  const bookingModal = showBookingModal && (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px' }}
      onClick={() => setShowBookingModal(false)}
    >
      <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)' }} />
      <div
        style={{ position: 'relative', backgroundColor: '#ffffff', borderRadius: 12, padding: '24px 20px 20px', width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 12 }}
        onClick={e => e.stopPropagation()}
      >
        <p style={{ fontSize: 16, fontWeight: 700, color: '#111', margin: '0 0 4px', textAlign: 'center' }}>How would you like to book?</p>
        <button
          onClick={() => { setShowBookingModal(false); setBookingFlow('by-time'); setSelectedService(null); setSelectedStaff(null); setSelectedTime(''); setCurrentScreen('book-datetime') }}
          style={{ backgroundColor: '#034325', color: '#ffffff', border: 'none', borderRadius: 8, padding: 13, fontSize: 14, fontWeight: 600, cursor: 'pointer', width: '100%' }}
        >
          By date and time
        </button>
        <button
          onClick={() => { setShowBookingModal(false); setBookingFlow('by-staff'); setSelectedService(null); setSelectedStaff(null); setSelectedTime(''); setStaffFilteredServices(null); setCurrentScreen('book-staff') }}
          style={{ backgroundColor: 'transparent', color: '#034325', border: '1.5px solid #034325', borderRadius: 8, padding: 13, fontSize: 14, fontWeight: 600, cursor: 'pointer', width: '100%' }}
        >
          By technician
        </button>
        <button
          onClick={() => setShowBookingModal(false)}
          style={{ background: 'none', border: 'none', fontSize: 14, color: '#6b7280', cursor: 'pointer', padding: '4px 0', textAlign: 'center' }}
        >
          Cancel
        </button>
      </div>
    </div>
  )

  // ── Home screen ────────────────────────────────────────────────────────────

  if (currentScreen === 'home') {
    const packages = services.filter(s => s.category === 'Package')
    const gridWrap: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }
    const gridCard: React.CSSProperties = { backgroundColor: '#ffffff', border: '1px solid #034325', borderRadius: 8, padding: '10px 12px', cursor: 'pointer' }
    return (
      <div style={screenWrap}>
        {menuOverlay}
        {bookingModal}
        {selectedProduct && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 300, backgroundColor: '#ffffff', overflowY: 'auto' }}>
            <div style={{ padding: '24px 20px 48px', maxWidth: 480, margin: '0 auto' }}>
              {selectedProduct.image_url ? (
                <img src={selectedProduct.image_url} alt={selectedProduct.name} style={{ width: '100%', borderRadius: 10, marginBottom: 16, objectFit: 'cover', maxHeight: 260 }} />
              ) : (
                <div style={{ width: '100%', height: 200, backgroundColor: '#e0e0e0', borderRadius: 10, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 13, color: '#6b7280' }}>No image</span>
                </div>
              )}
              <p style={{ fontSize: 18, fontWeight: 700, color: '#034325', margin: '0 0 8px' }}>{selectedProduct.name}</p>
              <p style={{ fontSize: 14, color: '#034325', fontWeight: 600, margin: '0 0 8px' }}>AED {selectedProduct.price ?? 0}</p>
              {selectedProduct.stock_count === 0
                ? <p style={{ fontSize: 13, color: '#991b1b', fontWeight: 600, margin: '0 0 24px' }}>Out of stock</p>
                : <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 24px' }}>{selectedProduct.stock_count} in stock</p>
              }
              <button onClick={() => setSelectedProduct(null)} style={{ border: '1px solid #034325', color: '#034325', background: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        )}
        {selectedPackage && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 300, backgroundColor: '#ffffff', overflowY: 'auto' }}>
            <div style={{ padding: '24px 20px 48px', maxWidth: 480, margin: '0 auto' }}>
              {selectedPackage.image_url && (
                <img src={selectedPackage.image_url} alt={selectedPackage.name} style={{ width: '100%', borderRadius: 10, marginBottom: 16, objectFit: 'cover', maxHeight: 260 }} />
              )}
              <p style={{ fontSize: 18, fontWeight: 700, color: '#034325', margin: '0 0 8px' }}>{selectedPackage.name}</p>
              <p style={{ fontSize: 14, color: '#034325', fontWeight: 600, margin: '0 0 4px' }}>AED {selectedPackage.price}</p>
              <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>{selectedPackage.duration_minutes} min</p>
              <p style={{ fontSize: 13, color: '#111', margin: '0 0 4px', lineHeight: 1.5 }}>{selectedPackage.name}</p>
              <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 24px' }}>Contact salon for full package details.</p>
              <button onClick={() => setSelectedPackage(null)} style={{ border: '1px solid #034325', color: '#034325', background: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        )}
        <div style={headerStyle}>
          <div>
            <p style={{ color: '#ffffff', fontSize: 16, fontWeight: 700, margin: 0 }}>Hi {client?.name}</p>
            <p style={{ color: '#00BF00', fontSize: 12, margin: '2px 0 0' }}>{salon?.name}</p>
          </div>
          <button onClick={() => setMenuOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[0, 1, 2].map(i => <div key={i} style={{ width: 20, height: 2, backgroundColor: '#ffffff', borderRadius: 1 }} />)}
          </button>
        </div>
        <div style={{ flex: 1, padding: '16px 16px 40px', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <button onClick={() => setShowBookingModal(true)} style={{ backgroundColor: '#034325', color: '#ffffff', border: 'none', borderRadius: 8, padding: 13, fontSize: 14, fontWeight: 600, cursor: 'pointer', width: '100%' }}>Book an appointment</button>
          {packages.length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Packages & Offers</p>
              <div style={gridWrap}>
                {packages.map(s => (
                  <div key={s.id} style={gridCard} onClick={() => setSelectedPackage(s)}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#111', margin: '0 0 4px' }}>{s.name}</p>
                    <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 2px' }}>{s.duration_minutes} min</p>
                    <p style={{ fontSize: 12, color: '#034325', fontWeight: 600, margin: 0 }}>AED {s.price}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(inventoryError || inventoryProducts.length > 0) && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Products</p>
              {inventoryError ? (
                <p style={{ fontSize: 13, color: '#991b1b', margin: 0 }}>{inventoryError}</p>
              ) : (
                <div style={gridWrap}>
                  {inventoryProducts.map(p => (
                    <div key={p.id} style={gridCard} onClick={() => setSelectedProduct(p)}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#111', margin: '0 0 4px' }}>{p.name}</p>
                      <p style={{ fontSize: 12, color: '#034325', fontWeight: 600, margin: '0 0 2px' }}>AED {p.price ?? 0}</p>
                      {p.stock_count === 0
                        ? <p style={{ fontSize: 11, color: '#991b1b', fontWeight: 600, margin: 0 }}>Out of stock</p>
                        : <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>{p.stock_count} in stock</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {blueFooter}
        </div>
      </div>
    )
  }

  // ── Book staff screen ──────────────────────────────────────────────────────

  if (currentScreen === 'book-staff') {
    return (
      <div style={screenWrap}>
        <div style={headerStyle}>
          <button onClick={() => setCurrentScreen('home')} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.5)', borderRadius: 6, color: '#ffffff', fontSize: 12, padding: '4px 12px', cursor: 'pointer' }}>Back</button>
          <p style={{ color: '#ffffff', fontSize: 15, fontWeight: 600, margin: 0 }}>Choose a technician</p>
          <div style={{ width: 60 }} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 100px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {staff.map(m => (
              <div
                key={m.id}
                onClick={async () => {
                  setSelectedStaff(m)
                  const { data: ssData } = await supabase
                    .from('staff_services')
                    .select('service_id')
                    .eq('staff_id', m.id)
                  if (ssData && ssData.length > 0) {
                    const ids = new Set(ssData.map((r: { service_id: string }) => r.service_id))
                    setStaffFilteredServices(services.filter(s => ids.has(s.id)))
                  } else {
                    setStaffFilteredServices(null)
                  }
                  setCurrentScreen('book-service')
                }}
                style={{ backgroundColor: '#ffffff', border: '0.5px solid #e0e0e0', borderRadius: 8, padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
              >
                <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: '#034325', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ color: '#ffffff', fontSize: 14, fontWeight: 700 }}>{initials(m.name)}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#111', margin: '0 0 2px' }}>{m.name}</p>
                  <p style={{ fontSize: 12, color: '#6b7280', margin: 0, textTransform: 'capitalize' }}>{m.role}</p>
                </div>
                <span style={{ color: '#9ca3af', fontSize: 16 }}>{'>'}</span>
              </div>
            ))}
          </div>
          {blueFooter}
        </div>
      </div>
    )
  }

  // ── Book service screen ────────────────────────────────────────────────────

  if (currentScreen === 'book-service') {
    const displayServices = staffFilteredServices ?? services
    const grouped = displayServices.reduce<Record<string, Service[]>>((acc, s) => {
      const cat = s.category ?? 'Other'
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(s)
      return acc
    }, {})

    const backTarget: Screen = bookingFlow === 'by-staff' ? 'book-staff' : bookingFlow === 'by-time' ? 'book-datetime' : 'home'
    const isConfirmStep = bookingFlow === 'by-time'

    return (
      <div style={screenWrap}>
        <div style={headerStyle}>
          <button onClick={() => setCurrentScreen(backTarget)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.5)', borderRadius: 6, color: '#ffffff', fontSize: 12, padding: '4px 12px', cursor: 'pointer' }}>Back</button>
          <p style={{ color: '#ffffff', fontSize: 15, fontWeight: 600, margin: 0 }}>Choose a service</p>
          <div style={{ width: 60 }} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 100px' }}>
          {Object.entries(grouped).map(([cat, svcs]) => (
            <div key={cat}>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '12px 0 8px' }}>{cat}</p>
              {svcs.map(s => {
                const isSel = selectedService?.id === s.id
                return (
                  <div
                    key={s.id}
                    onClick={() => setSelectedService(s)}
                    style={{ backgroundColor: '#ffffff', border: isSel ? '2px solid #034325' : '0.5px solid #e0e0e0', borderLeft: isSel ? '2px solid #034325' : '2px solid transparent', borderRadius: 8, padding: '10px 12px', marginBottom: 8, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#111', margin: '0 0 2px' }}>{s.name}</p>
                      <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>{s.duration_minutes} min{s.price > 0 ? ` · AED ${s.price}` : ''}</p>
                    </div>
                    {isSel && <span style={{ color: '#034325', fontSize: 16, fontWeight: 700 }}>&#10003;</span>}
                  </div>
                )
              })}
            </div>
          ))}
          {isConfirmStep && bookingError && <p style={{ fontSize: 13, color: '#991b1b', margin: '8px 0 0' }}>{bookingError}</p>}
          {blueFooter}
        </div>
        <div style={{ position: 'sticky', bottom: 0, padding: '12px 16px', backgroundColor: '#f9fafb', borderTop: '0.5px solid #e0e0e0' }}>
          <button
            onClick={isConfirmStep ? handleBook : () => setCurrentScreen('book-datetime')}
            disabled={!selectedService || (isConfirmStep && bookingLoading)}
            style={{ backgroundColor: selectedService ? '#034325' : '#e0e0e0', color: selectedService ? '#ffffff' : '#9ca3af', border: 'none', borderRadius: 8, padding: 13, fontSize: 14, fontWeight: 600, cursor: selectedService ? 'pointer' : 'not-allowed', width: '100%' }}
          >
            {isConfirmStep ? (bookingLoading ? 'Booking...' : 'Confirm booking') : 'Next'}
          </button>
        </div>
      </div>
    )
  }

  // ── Book date/time screen ──────────────────────────────────────────────────

  if (currentScreen === 'book-datetime') {
    const today = new Date().toISOString().split('T')[0]
    const backTarget: Screen = bookingFlow === 'by-time' ? 'home' : 'book-service'
    const isConfirmStep = bookingFlow !== 'by-time'

    return (
      <div style={screenWrap}>
        <div style={headerStyle}>
          <button onClick={() => setCurrentScreen(backTarget)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.5)', borderRadius: 6, color: '#ffffff', fontSize: 12, padding: '4px 12px', cursor: 'pointer' }}>Back</button>
          <p style={{ color: '#ffffff', fontSize: 15, fontWeight: 600, margin: 0 }}>Pick a time</p>
          <div style={{ width: 60 }} />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 100px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>Date</p>
            <input
              type="date"
              value={selectedDate}
              min={today}
              onChange={e => { setSelectedDate(e.target.value); setSelectedTime('') }}
              style={{ width: '100%', border: '0.5px solid #1D558F', borderRadius: 8, padding: '10px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box', backgroundColor: '#ffffff' }}
            />
          </div>

          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Available slots</p>
            {slotsLoading ? (
              <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Loading...</p>
            ) : availableSlots.length === 0 ? (
              <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>No slots available for this date.</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {availableSlots.map(t => {
                  const isSel = selectedTime === t
                  return (
                    <button
                      key={t}
                      onClick={() => setSelectedTime(t)}
                      style={{ border: '0.5px solid #034325', borderRadius: 6, padding: '4px 10px', fontSize: 12, backgroundColor: isSel ? '#034325' : '#ffffff', color: isSel ? '#ffffff' : '#034325', cursor: 'pointer', fontWeight: isSel ? 600 : 400 }}
                    >
                      {t}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Technician (optional)</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                onClick={() => setSelectedStaff(null)}
                style={{ backgroundColor: '#ffffff', border: selectedStaff === null ? '2px solid #034325' : '0.5px solid #e0e0e0', borderRadius: 8, padding: '10px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#111', margin: '0 0 2px' }}>Any available</p>
                  <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>We'll assign the best match</p>
                </div>
                {selectedStaff === null && <span style={{ color: '#034325', fontSize: 16, fontWeight: 700 }}>&#10003;</span>}
              </div>
              {staff.map(m => {
                const isSel = selectedStaff?.id === m.id
                return (
                  <div
                    key={m.id}
                    onClick={() => setSelectedStaff(m)}
                    style={{ backgroundColor: '#ffffff', border: isSel ? '2px solid #034325' : '0.5px solid #e0e0e0', borderRadius: 8, padding: '10px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#111', margin: '0 0 2px' }}>{m.name}</p>
                      <p style={{ fontSize: 12, color: '#6b7280', margin: 0, textTransform: 'capitalize' }}>{m.role}</p>
                    </div>
                    {isSel && <span style={{ color: '#034325', fontSize: 16, fontWeight: 700 }}>&#10003;</span>}
                  </div>
                )
              })}
            </div>
          </div>

          {isConfirmStep && bookingError && <p style={{ fontSize: 13, color: '#991b1b', margin: 0 }}>{bookingError}</p>}
          {blueFooter}
        </div>

        <div style={{ position: 'sticky', bottom: 0, padding: '12px 16px', backgroundColor: '#f9fafb', borderTop: '0.5px solid #e0e0e0' }}>
          <button
            onClick={() => bookingFlow === 'by-time' ? setCurrentScreen('book-service') : handleBook()}
            disabled={!selectedTime || (isConfirmStep && bookingLoading)}
            style={{ backgroundColor: selectedTime ? '#034325' : '#e0e0e0', color: selectedTime ? '#ffffff' : '#9ca3af', border: 'none', borderRadius: 8, padding: 13, fontSize: 14, fontWeight: 600, cursor: selectedTime ? 'pointer' : 'not-allowed', width: '100%' }}
          >
            {isConfirmStep ? (bookingLoading ? 'Booking...' : 'Confirm booking') : 'Next'}
          </button>
        </div>
      </div>
    )
  }

  // ── Book confirm screen ────────────────────────────────────────────────────

  if (currentScreen === 'book-confirm') {
    const displayDate = selectedDate ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'long' }) : ''
    return (
      <div style={{ ...screenWrap, justifyContent: 'center', padding: '32px 24px', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 28, color: '#034325' }}>&#10003;</span>
          </div>
          <p style={{ fontSize: 18, fontWeight: 700, color: '#034325', margin: 0 }}>You are booked in</p>
          <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>{salon?.name}</p>
        </div>
        <div style={{ backgroundColor: '#ffffff', border: '0.5px solid #e0e0e0', borderRadius: 10, padding: '16px 18px', width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Booking ref</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#034325' }}>{bookingRef}</span>
          </div>
          <div style={{ height: 0.5, backgroundColor: '#f0f0f0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Date & time</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#111' }}>{displayDate} · {selectedTime}</span>
          </div>
          <div style={{ height: 0.5, backgroundColor: '#f0f0f0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Service</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#111' }}>{selectedService?.name}</span>
          </div>
          {selectedStaff && (
            <>
              <div style={{ height: 0.5, backgroundColor: '#f0f0f0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: '#6b7280' }}>Technician</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: '#111' }}>{selectedStaff.name}</span>
              </div>
            </>
          )}
        </div>
        <button onClick={() => setCurrentScreen('home')} style={{ backgroundColor: 'transparent', color: '#034325', border: '1px solid #034325', borderRadius: 8, padding: '12px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer', width: '100%' }}>Back to home</button>
        {blueFooter}
      </div>
    )
  }

  // ── My Profile screen ─────────────────────────────────────────────────────

  if (currentScreen === 'my-profile') {
    const labelStyle: React.CSSProperties = { fontSize: 12, color: '#6b7280', fontWeight: 500 }
    const inputStyle: React.CSSProperties = { border: '0.5px solid #e0e0e0', borderRadius: 8, padding: '10px 12px', fontSize: 13, outline: 'none', backgroundColor: '#ffffff', color: '#111', width: '100%', boxSizing: 'border-box' }
    return (
      <div style={screenWrap}>
        <div style={headerStyle}>
          <button onClick={() => setCurrentScreen('home')} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.5)', borderRadius: 6, color: '#ffffff', fontSize: 12, padding: '4px 12px', cursor: 'pointer' }}>Back</button>
          <p style={{ color: '#ffffff', fontSize: 15, fontWeight: 600, margin: 0 }}>My Profile</p>
          <div style={{ width: 60 }} />
        </div>
        {profileLoading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ fontSize: 13, color: '#6b7280' }}>Loading...</p>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 100px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>Name</label>
              <input value={profileName} onChange={e => setProfileName(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>Phone</label>
              <input value={client?.phone ?? ''} readOnly style={{ ...inputStyle, backgroundColor: '#f3f4f6', color: '#6b7280' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>Email</label>
              <input type="email" value={profileEmail} onChange={e => setProfileEmail(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>Date of birth</label>
              <input type="date" value={profileDob} onChange={e => setProfileDob(e.target.value)} style={inputStyle} />
            </div>
            {profileError && <p style={{ fontSize: 13, color: '#991b1b', margin: 0 }}>{profileError}</p>}
            <button
              onClick={handleProfileSave}
              disabled={profileSaving}
              style={{ backgroundColor: profileSaving ? '#e0e0e0' : '#034325', color: profileSaving ? '#9ca3af' : '#ffffff', border: 'none', borderRadius: 8, padding: 13, fontSize: 14, fontWeight: 600, cursor: profileSaving ? 'not-allowed' : 'pointer', width: '100%' }}
            >
              {profileSaving ? 'Saving...' : 'Save'}
            </button>
            {blueFooter}
          </div>
        )}
      </div>
    )
  }

  // ── Upcoming Appointments screen ───────────────────────────────────────────

  if (currentScreen === 'upcoming') {
    return (
      <div style={screenWrap}>
        <div style={headerStyle}>
          <button onClick={() => setCurrentScreen('home')} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.5)', borderRadius: 6, color: '#ffffff', fontSize: 12, padding: '4px 12px', cursor: 'pointer' }}>Back</button>
          <p style={{ color: '#ffffff', fontSize: 15, fontWeight: 600, margin: 0 }}>Upcoming Appointments</p>
          <div style={{ width: 60 }} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 100px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {upcomingLoading ? (
            <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Loading...</p>
          ) : upcomingAppts.length === 0 ? (
            <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>No upcoming appointments</p>
          ) : (
            upcomingAppts.map(appt => (
              <div key={appt.id} style={{ backgroundColor: '#ffffff', border: '0.5px solid #e0e0e0', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#034325' }}>
                    {appt.reference_number ? `APT-${String(appt.reference_number).padStart(4, '0')}` : appt.id.slice(0, 8).toUpperCase()}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#034325', backgroundColor: '#E1F5EE', borderRadius: 4, padding: '2px 8px' }}>{appt.status}</span>
                </div>
                <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>{fmtDubaiDateTime(appt.starts_at)}</p>
                {appt.staffName && <p style={{ fontSize: 12, color: '#111', margin: 0 }}>Technician: {appt.staffName}</p>}
                {appt.services.length > 0 && <p style={{ fontSize: 12, color: '#111', margin: 0 }}>{appt.services.join(', ')}</p>}
              </div>
            ))
          )}
          {blueFooter}
        </div>
      </div>
    )
  }

  // ── Appointment History screen ─────────────────────────────────────────────

  if (currentScreen === 'history') {
    const badgeStyle = (status: string): React.CSSProperties => {
      if (status === 'completed') return { color: '#034325', backgroundColor: '#E1F5EE', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }
      if (status === 'cancelled') return { color: '#6b7280', backgroundColor: '#f3f4f6', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }
      return { color: '#991b1b', backgroundColor: '#fee2e2', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }
    }
    const badgeLabel = (status: string) => status === 'no_show' ? 'No show' : status.charAt(0).toUpperCase() + status.slice(1)
    return (
      <div style={screenWrap}>
        <div style={headerStyle}>
          <button onClick={() => setCurrentScreen('home')} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.5)', borderRadius: 6, color: '#ffffff', fontSize: 12, padding: '4px 12px', cursor: 'pointer' }}>Back</button>
          <p style={{ color: '#ffffff', fontSize: 15, fontWeight: 600, margin: 0 }}>Appointment History</p>
          <div style={{ width: 60 }} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 100px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {historyLoading ? (
            <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Loading...</p>
          ) : historyAppts.length === 0 ? (
            <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>No appointment history</p>
          ) : (
            historyAppts.map(appt => (
              <div key={appt.id} style={{ backgroundColor: '#ffffff', border: '0.5px solid #e0e0e0', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#034325' }}>
                    {appt.reference_number ? `APT-${String(appt.reference_number).padStart(4, '0')}` : appt.id.slice(0, 8).toUpperCase()}
                  </span>
                  <span style={badgeStyle(appt.status)}>{badgeLabel(appt.status)}</span>
                </div>
                <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>{fmtDubaiDateTime(appt.starts_at)}</p>
                {appt.staffName && <p style={{ fontSize: 12, color: '#111', margin: 0 }}>Technician: {appt.staffName}</p>}
                {appt.services.length > 0 && <p style={{ fontSize: 12, color: '#111', margin: 0 }}>{appt.services.join(', ')}</p>}
                {appt.amountPaid > 0 && <p style={{ fontSize: 12, color: '#111', margin: 0 }}>Paid: AED {appt.amountPaid}</p>}
              </div>
            ))
          )}
          {blueFooter}
        </div>
      </div>
    )
  }

  // ── Reviews screen ────────────────────────────────────────────────────────

  if (currentScreen === 'reviews') {
    const ratingBtn = (val: number, selected: number, onSelect: (v: number) => void) => (
      <button
        key={val}
        type="button"
        onClick={() => onSelect(val)}
        style={{
          width: 36, height: 36, borderRadius: 6, border: selected === val ? 'none' : '0.5px solid #e0e0e0',
          backgroundColor: selected === val ? '#034325' : '#ffffff',
          color: selected === val ? '#ffffff' : '#111',
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}
      >{val}</button>
    )

    return (
      <div style={screenWrap}>
        <div style={headerStyle}>
          <button onClick={() => setCurrentScreen('home')} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.5)', borderRadius: 6, color: '#ffffff', fontSize: 12, padding: '4px 12px', cursor: 'pointer' }}>Back</button>
          <p style={{ color: '#ffffff', fontSize: 15, fontWeight: 600, margin: 0 }}>Reviews</p>
          <div style={{ width: 60 }} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 100px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {reviewsLoading ? (
            <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Loading...</p>
          ) : pendingReviews.length === 0 && submittedReviews.length === 0 ? (
            <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>No appointments to review yet</p>
          ) : (
            <>
              {pendingReviews.length > 0 && (
                <div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Leave a Review</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {pendingReviews.map(appt => {
                      const isOpen = expandedAppt === appt.id
                      return (
                        <div key={appt.id} style={{ backgroundColor: '#ffffff', border: '0.5px solid #e0e0e0', borderRadius: 8, overflow: 'hidden' }}>
                          <div
                            onClick={() => {
                              if (isOpen) { setExpandedAppt(null) } else {
                                setExpandedAppt(appt.id)
                                setReviewSalonRating(0); setReviewStaffRating(0); setReviewComment(''); setReviewError('')
                              }
                            }}
                            style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4 }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: '#034325' }}>
                                {appt.reference_number ? `APT-${String(appt.reference_number).padStart(4, '0')}` : appt.id.slice(0, 8).toUpperCase()}
                              </span>
                              <span style={{ fontSize: 12, color: '#6b7280' }}>{isOpen ? '▲' : '▼'}</span>
                            </div>
                            <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>{fmtDubaiDateTime(appt.starts_at)}</p>
                            {appt.staffName && <p style={{ fontSize: 12, color: '#111', margin: 0 }}>Technician: {appt.staffName}</p>}
                            {appt.services.length > 0 && <p style={{ fontSize: 12, color: '#111', margin: 0 }}>{appt.services.join(', ')}</p>}
                          </div>
                          {isOpen && (
                            <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 12, borderTop: '0.5px solid #e0e0e0' }}>
                              <div style={{ paddingTop: 12 }}>
                                <p style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, margin: '0 0 8px' }}>Salon rating</p>
                                <div style={{ display: 'flex', gap: 8 }}>
                                  {[1,2,3,4,5].map(v => ratingBtn(v, reviewSalonRating, setReviewSalonRating))}
                                </div>
                              </div>
                              <div>
                                <p style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, margin: '0 0 8px' }}>Technician rating</p>
                                <div style={{ display: 'flex', gap: 8 }}>
                                  {[1,2,3,4,5].map(v => ratingBtn(v, reviewStaffRating, setReviewStaffRating))}
                                </div>
                              </div>
                              <div>
                                <p style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, margin: '0 0 6px' }}>Comment (optional)</p>
                                <textarea
                                  value={reviewComment}
                                  onChange={e => setReviewComment(e.target.value)}
                                  rows={3}
                                  style={{ width: '100%', border: '0.5px solid #e0e0e0', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                                />
                              </div>
                              {reviewError && <p style={{ fontSize: 12, color: '#991b1b', margin: 0 }}>{reviewError}</p>}
                              <button
                                onClick={() => handleSubmitReview(appt)}
                                disabled={reviewSubmitting}
                                style={{ backgroundColor: reviewSubmitting ? '#e0e0e0' : '#034325', color: reviewSubmitting ? '#9ca3af' : '#ffffff', border: 'none', borderRadius: 8, padding: '10px 0', fontSize: 13, fontWeight: 600, cursor: reviewSubmitting ? 'not-allowed' : 'pointer', width: '100%' }}
                              >
                                {reviewSubmitting ? 'Submitting...' : 'Submit review'}
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {submittedReviews.length > 0 && (
                <div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>My Reviews</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {submittedReviews.map(r => (
                      <div key={r.id} style={{ backgroundColor: '#ffffff', border: '0.5px solid #e0e0e0', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#034325' }}>
                          {r.reference_number ? `APT-${String(r.reference_number).padStart(4, '0')}` : 'Review'}
                        </span>
                        {r.starts_at && <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>{fmtDubaiDateTime(r.starts_at)}</p>}
                        <p style={{ fontSize: 12, color: '#111', margin: 0 }}>Salon: {r.salon_rating} / 5 · Technician: {r.staff_rating} / 5</p>
                        {r.comment && <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>{r.comment}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {blueFooter}
        </div>
      </div>
    )
  }

  // ── Change PIN screen ──────────────────────────────────────────────────────

  if (currentScreen === 'change-pin') {
    const pinBoxStyle: React.CSSProperties = {
      width: 48, height: 52, textAlign: 'center', fontSize: 20, fontWeight: 700,
      border: '1px solid #1D558F', borderRadius: 8, outline: 'none',
      backgroundColor: '#ffffff', color: '#034325', boxSizing: 'border-box',
    }
    return (
      <div style={{ ...screenWrap, backgroundColor: '#ffffff' }}>
        <div style={headerStyle}>
          <button onClick={() => setCurrentScreen('home')} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.5)', borderRadius: 6, color: '#ffffff', fontSize: 12, padding: '4px 12px', cursor: 'pointer' }}>Back</button>
          <p style={{ color: '#ffffff', fontSize: 15, fontWeight: 600, margin: 0 }}>Change PIN</p>
          <div style={{ width: 60 }} />
        </div>
        <div style={{ flex: 1, padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div>
            <p style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, margin: '0 0 10px', textAlign: 'center' }}>New PIN</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              {changePinNew.map((digit, i) => (
                <input key={i} ref={el => { changePinNewRefs.current[i] = el }} type="password" inputMode="numeric" maxLength={1} value={digit} onChange={e => handleChangePinNewChange(i, e.target.value)} onKeyDown={e => handleChangePinNewKeyDown(i, e)} style={pinBoxStyle} />
              ))}
            </div>
          </div>
          <div>
            <p style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, margin: '0 0 10px', textAlign: 'center' }}>Confirm PIN</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              {changePinConfirm.map((digit, i) => (
                <input key={i} ref={el => { changePinConfirmRefs.current[i] = el }} type="password" inputMode="numeric" maxLength={1} value={digit} onChange={e => handleChangePinConfirmChange(i, e.target.value)} onKeyDown={e => handleChangePinConfirmKeyDown(i, e)} style={pinBoxStyle} />
              ))}
            </div>
          </div>
          {changePinError && <p style={{ fontSize: 13, color: '#991b1b', margin: 0, textAlign: 'center' }}>{changePinError}</p>}
          <button onClick={handleChangePin} disabled={changePinLoading} style={{ backgroundColor: '#034325', color: '#ffffff', border: 'none', borderRadius: 8, padding: 13, fontSize: 15, fontWeight: 700, cursor: changePinLoading ? 'not-allowed' : 'pointer', opacity: changePinLoading ? 0.7 : 1, width: '100%' }}>
            {changePinLoading ? 'Saving...' : 'Save PIN'}
          </button>
        </div>
        {blueFooter}
      </div>
    )
  }

  // ── Login screen ───────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 48, paddingLeft: 16, paddingRight: 16 }}>
      <div style={{ backgroundColor: '#034325', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400, textAlign: 'center', marginBottom: 24, boxSizing: 'border-box' }}>
        <p style={{ color: '#ffffff', fontSize: 20, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>{salon?.name}</p>
        {(salon?.city || salon?.country) && (
          <p style={{ color: '#C9A227', fontSize: 13, margin: '8px 0 0', lineHeight: 1.3 }}>{[salon.city, salon.country].filter(Boolean).join(', ')}</p>
        )}
      </div>
      <div style={{ width: '100%', maxWidth: 400, paddingBottom: 40, boxSizing: 'border-box' }}>
        <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <p style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, margin: '0 0 6px' }}>Mobile number</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={countryCode} onChange={e => setCountryCode(e.target.value)} style={{ border: '1px solid #1D558F', borderRadius: 8, outline: 'none', backgroundColor: '#f9f9f9', fontSize: 13, padding: '0 8px', height: 44, cursor: 'pointer', flexShrink: 0 }}>
                {CLIENT_COUNTRY_CODES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
              </select>
              <input type="tel" placeholder="50 123 4567" value={phone} onChange={e => setPhone(e.target.value)} required style={{ flex: 1, backgroundColor: '#ffffff', color: '#000000', border: '1px solid #1D558F', borderRadius: 8, padding: '11px 14px', fontSize: 14, outline: 'none' }} />
            </div>
          </div>
          <div>
            <p style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, margin: '0 0 10px' }}>5-digit PIN</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              {pin.map((digit, i) => (
                <input key={i} ref={el => { pinRefs.current[i] = el }} type="password" inputMode="numeric" maxLength={1} value={digit} onChange={e => handlePinChange(i, e.target.value)} onKeyDown={e => handlePinKeyDown(i, e)} style={{ width: 48, height: 52, textAlign: 'center', fontSize: 20, fontWeight: 700, border: '1px solid #1D558F', borderRadius: 8, outline: 'none', backgroundColor: '#ffffff', color: '#034325', boxSizing: 'border-box' }} />
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, margin: 0 }}>Booking link:</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ flex: 1, backgroundColor: '#f9fafb', border: '1px solid #1D558F', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#111111', wordBreak: 'break-all' }}>
                noorie-salon.vercel.app/{slug}/client
              </div>
              <button
                onClick={handleCopyLink}
                type="button"
                style={{
                  backgroundColor: '#034325',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {copied ? '✓' : '📋'}
              </button>
            </div>
            {copied && <p style={{ fontSize: 11, color: '#059669', margin: 0 }}>Copied!</p>}
          </div>
          {error && <p style={{ fontSize: 13, color: '#991b1b', margin: 0 }}>{error}</p>}
          <button type="submit" disabled={loading} style={{ backgroundColor: '#034325', color: '#ffffff', border: 'none', borderRadius: 8, padding: 13, fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, width: '100%' }}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
      {blueFooter}
    </div>
  )
}
