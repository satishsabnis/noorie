import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/authStore'
import { supabase } from '../lib/supabase'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function getDatePartsInTz(date: Date, tz: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? '0')
  return { year: get('year'), month: get('month') - 1, day: get('day') }
}

export function salonOffsetStr(tz: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: tz, timeZoneName: 'longOffset',
  }).formatToParts(new Date())
  const name = parts.find(p => p.type === 'timeZoneName')?.value ?? ''
  return name.replace('GMT', '') || '+00:00'
}

// Returns a Date whose UTC date parts equal the current local date in tz.
// Use .getUTCFullYear() / .getUTCMonth() / .getUTCDate() / .getUTCDay() on the result.
export function salonNowUTC(tz: string): Date {
  const { year, month, day } = getDatePartsInTz(new Date(), tz)
  return new Date(Date.UTC(year, month, day))
}

export function salonTodayStr(tz: string): string {
  const d = salonNowUTC(tz)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

export function salonDateRange(dateStr: string, tz: string): { start: string; end: string } {
  const offset = salonOffsetStr(tz)
  return {
    start: `${dateStr}T00:00:00${offset}`,
    end:   `${dateStr}T23:59:59${offset}`,
  }
}

// Converts a UTC ISO string to a YYYY-MM-DD date in the salon's local timezone.
export function salonLocalDateStr(utcIso: string, tz: string): string {
  const { year, month, day } = getDatePartsInTz(new Date(utcIso), tz)
  return `${year}-${pad2(month + 1)}-${pad2(day)}`
}

export function useSalonTimezone(salonIdOverride?: string | null) {
  const { staffRecord } = useAuthStore()
  const salonId = salonIdOverride ?? staffRecord?.salon_id
  const [tz, setTz] = useState('Asia/Dubai')

  useEffect(() => {
    if (!salonId) return
    supabase
      .from('salon_config')
      .select('timezone')
      .eq('salon_id', salonId)
      .single()
      .then(({ data }) => {
        if (data?.timezone) setTz(data.timezone as string)
      })
  }, [salonId]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    tz,
    getSalonNow:         () => salonNowUTC(tz),
    getSalonTodayString: () => salonTodayStr(tz),
    getSalonDateRange:   (dateStr: string) => salonDateRange(dateStr, tz),
    toSalonDate:         (utcIso: string) => salonLocalDateStr(utcIso, tz),
  }
}
