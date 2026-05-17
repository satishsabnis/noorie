import { supabase } from './supabase'

export interface OutstandingBalance {
  appointment_id: string
  client_name: string
  client_phone: string | null
  starts_at: string
  amount: number
}

export interface GetOutstandingBalancesOptions {
  sortBy?: 'amount' | 'date'
}

export async function getOutstandingBalances(
  salonId: string,
  options?: GetOutstandingBalancesOptions,
): Promise<OutstandingBalance[]> {
  const sortBy = options?.sortBy ?? 'amount'

  const { data, error } = await supabase
    .from('appointments')
    .select('id, starts_at, clients(name, phone), appointment_services(price), payments(amount)')
    .eq('salon_id', salonId)
    .eq('status', 'completed')
    .order('starts_at', { ascending: false })

  if (error) throw error

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: OutstandingBalance[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const a of (data ?? []) as any[]) {
    const due = (a.appointment_services ?? []).reduce(
      (s: number, sv: { price?: number | null }) => s + (sv.price ?? 0), 0,
    )
    const paid = (a.payments ?? []).reduce(
      (s: number, p: { amount?: number | null }) => s + (p.amount ?? 0), 0,
    )
    const amount = Math.round((due - paid) * 100) / 100
    if (amount > 0) {
      items.push({
        appointment_id: a.id,
        client_name: a.clients?.name ?? 'Unknown',
        client_phone: a.clients?.phone ?? null,
        starts_at: a.starts_at,
        amount,
      })
    }
  }

  if (sortBy === 'date') {
    items.sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
  } else {
    items.sort((a, b) => b.amount - a.amount)
  }

  return items
}
