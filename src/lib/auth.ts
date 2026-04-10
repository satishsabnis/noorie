import { supabase } from './supabase'

export async function signInWithMobile(countryCode: string, mobile: string, password: string) {
  const email = `${countryCode}${mobile}@noorie.internal`
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function getStaffRecord(countryCode: string, mobile: string) {
  const phone = `${countryCode}${mobile}`
  console.log('getStaffRecord: searching phone =', phone)
  const { data, error } = await supabase
    .from('staff')
    .select('id, name, role, phone, auth_user_id, salon_id')
    .eq('phone', phone)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function getStaffByPhone(phone: string) {
  const { data, error } = await supabase
    .from('staff')
    .select('id, name, role, phone, auth_user_id, salon_id')
    .eq('phone', phone)
    .maybeSingle()
  if (error) throw error
  return data
}
