// Supabase Edge Function: update-staff-pin
// Updates the auth password for an existing staff member via the Admin API
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface UpdateStaffPinBody {
  staff_id: string
  pin: string
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

  let body: UpdateStaffPinBody
  try {
    body = await req.json() as UpdateStaffPinBody
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400)
  }

  const { staff_id, pin } = body

  // Validate PIN format (5 digits)
  if (!/^\d{5}$/.test(pin)) {
    return jsonResponse({ success: false, error: 'PIN must be exactly 5 digits' }, 400)
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Fetch staff record to get auth_user_id
  const { data: staffData, error: staffErr } = await supabaseAdmin
    .from('staff')
    .select('auth_user_id')
    .eq('id', staff_id)
    .single()

  if (staffErr || !staffData || !staffData.auth_user_id) {
    return jsonResponse({ success: false, error: staffErr?.message ?? 'Staff not found' }, 400)
  }

  const authUserId = staffData.auth_user_id

  // Update auth user password
  const authPassword = pin + 'x'
  const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
    authUserId,
    { password: authPassword },
  )

  if (updateErr) {
    return jsonResponse({ success: false, error: updateErr.message ?? 'Failed to update password' }, 400)
  }

  return jsonResponse({ success: true, staff_id }, 200)
})
