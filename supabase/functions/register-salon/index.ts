import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface RegisterSalonBody {
  authEmail: string
  password: string
  salonName: string
  ownerName: string
  countryCode: string
  mobile: string
  email: string
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

  let body: RegisterSalonBody
  try {
    body = await req.json() as RegisterSalonBody
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400)
  }

  const { authEmail, password, salonName, ownerName, countryCode, mobile, email } = body
  const mobileStripped = mobile.replace(/^0+/, '')
  const phone = `${countryCode}${mobileStripped}`

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
  })
  if (authErr || !authData.user) {
    return jsonResponse({ success: false, error: authErr?.message ?? 'Failed to create auth user' }, 400)
  }

  const userId = authData.user.id

  const { data: salonData, error: salonError } = await supabaseAdmin
    .from('salons')
    .insert({ name: salonName })
    .select('id')
    .single()
  if (salonError || !salonData) {
    return jsonResponse({ success: false, error: salonError?.message ?? 'Failed to create salon' }, 400)
  }

  const salonId = salonData.id

  const { error: staffError } = await supabaseAdmin
    .from('staff')
    .insert({
      name: ownerName,
      phone,
      email,
      role: 'owner',
      auth_user_id: userId,
      salon_id: salonId,
    })
  if (staffError) {
    return jsonResponse({ success: false, error: staffError.message }, 400)
  }

  const { error: configError } = await supabaseAdmin
    .from('salon_config')
    .insert({ salon_id: salonId })
  if (configError) {
    return jsonResponse({ success: false, error: configError.message }, 400)
  }

  return jsonResponse({ success: true }, 200)
})
