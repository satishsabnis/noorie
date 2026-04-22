import { supabase } from './supabase'

export async function signInWithMobile(countryCode: string, mobile: string, password: string) {
  // Try digits-only format first (new format: 971501234567@noorie.internal)
  const emailNew = `${(countryCode + mobile).replace(/\D/g, '')}@noorie.internal`
  const { data, error } = await supabase.auth.signInWithPassword({ email: emailNew, password })
  if (!error) return data

  // Fallback: try with plus sign (old format: +971501234567@noorie.internal)
  const isInvalidCredentials = error.message.toLowerCase().includes('invalid') || error.message.toLowerCase().includes('credentials')
  if (!isInvalidCredentials) throw error

  const emailOld = `${countryCode}${mobile}@noorie.internal`
  const { data: data2, error: error2 } = await supabase.auth.signInWithPassword({ email: emailOld, password })
  if (error2) throw error2
  return data2
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
