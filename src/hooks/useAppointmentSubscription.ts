import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

interface Toast {
  id: string
  message: string
  appointmentId: string
  timestamp: number
}

export function useAppointmentSubscription(
  onNewAppointment: (toast: Toast) => void,
  enabled: boolean = true
) {
  const { staffRecord } = useAuthStore()

  useEffect(() => {
    if (!enabled || !staffRecord?.id || !staffRecord?.salon_id) return

    const channel = supabase
      .channel(`appointments:${staffRecord.salon_id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'appointments',
          filter: `salon_id=eq.${staffRecord.salon_id}`,
        },
        (payload) => {
          const appointment = payload.new as any

          // Technicians see only their own, supervisors see all
          const isTechnician = staffRecord.role === 'technician'
          const isRelevant = isTechnician
            ? appointment.staff_id === staffRecord.id
            : true

          if (isRelevant) {
            const toast: Toast = {
              id: `${Date.now()}-${Math.random()}`,
              message: 'New appointment scheduled',
              appointmentId: appointment.id,
              timestamp: Date.now(),
            }
            onNewAppointment(toast)
          }
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [staffRecord?.id, staffRecord?.salon_id, staffRecord?.role, enabled, onNewAppointment])
}
