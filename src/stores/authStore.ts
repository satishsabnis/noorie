import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { getStaffByPhone } from '../lib/auth'

interface StaffRecord {
  id: string
  name: string
  role: string
  phone: string | null
  auth_user_id: string | null
  salon_id: string | null
}

interface AuthState {
  user: User | null
  staffRecord: StaffRecord | null
  role: string | null
  isLoading: boolean
  isAuthenticated: boolean
  signIn: (user: User, staff: StaffRecord) => void
  signOut: () => void
  setStaffRecord: (staff: StaffRecord) => void
  initialize: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  staffRecord: null,
  role: null,
  isLoading: true,
  isAuthenticated: false,

  signIn: (user, staff) => set({
    user,
    staffRecord: staff,
    role: staff.role,
    isAuthenticated: true,
  }),

  signOut: () => {
    supabase.auth.signOut()
    set({ user: null, staffRecord: null, role: null, isAuthenticated: false })
  },

  setStaffRecord: (staff) => set({
    staffRecord: staff,
    role: staff.role,
  }),

  initialize: async () => {
    set({ isLoading: true })

    const { data: { session } } = await supabase.auth.getSession()

    if (session?.user) {
      const phone = session.user.email?.replace('@noorie.internal', '') ?? ''
      const staff = await getStaffByPhone(phone).catch(() => null)
      if (staff) {
        set({ user: session.user, staffRecord: staff, role: staff.role, isAuthenticated: true })
      }
    }

    set({ isLoading: false })

    let currentUserId: string | null = null

    supabase.auth.onAuthStateChange(async (event, session) => {
      const newUserId = session?.user?.id ?? null
      if (newUserId === currentUserId) return
      currentUserId = newUserId

      if (session?.user) {
        const phone = session.user.email?.replace('@noorie.internal', '') ?? ''
        const staff = await getStaffByPhone(phone).catch(() => null)
        set({
          user: session.user,
          staffRecord: staff,
          role: staff?.role ?? null,
          isAuthenticated: !!staff,
        })
      } else {
        set({ user: null, staffRecord: null, role: null, isAuthenticated: false })
      }
    })
  },
}))
