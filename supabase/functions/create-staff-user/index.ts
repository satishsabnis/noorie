// Supabase Edge Function: create-staff-user
// Creates an auth user via the Admin API and the corresponding staff +
// staff_services rows, all server-side, so the caller's session is preserved.
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars (provided by the
// Edge Functions runtime when deployed).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface CreateStaffUserBody {
  email: string
  password: string
  salon_id: string
  name: string
  phone: string
  role: string
  monthly_salary: number
  commission_pct: number
  service_ids: string[]
}

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405)
  }

  let body: CreateStaffUserBody
  try {
    body = await req.json() as CreateStaffUserBody
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400)
  }

  const {
    email, password, salon_id, name, phone, role,
    monthly_salary, commission_pct, service_ids,
  } = body

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (authErr || !authData.user) {
    return jsonResponse({ success: false, error: authErr?.message ?? 'Failed to create auth user' }, 400)
  }

  const authUserId = authData.user.id

  const { data: staffRow, error: staffErr } = await supabaseAdmin
    .from('staff')
    .insert({
      salon_id,
      name,
      phone,
      role,
      auth_user_id: authUserId,
      status: 'active',
      temp_password_set: true,
      monthly_salary,
      commission_pct,
    })
    .select('id')
    .single()
  if (staffErr || !staffRow) {
    return jsonResponse({ success: false, error: staffErr?.message ?? 'Failed to create staff record' }, 400)
  }

  if (Array.isArray(service_ids) && service_ids.length > 0) {
    const { error: ssErr } = await supabaseAdmin
      .from('staff_services')
      .insert(service_ids.map(service_id => ({ staff_id: staffRow.id, service_id, salon_id })))
    if (ssErr) {
      return jsonResponse({ success: false, error: ssErr.message }, 400)
    }
  }

  return jsonResponse({ success: true, staff_id: staffRow.id }, 200)
})
