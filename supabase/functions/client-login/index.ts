import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface ClientLoginBody {
  action?: string
  slug?: string
  countryCode?: string
  phone?: string
  pin?: string
  newPin?: string
  clientId?: string
  access_token?: string
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
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  let body: ClientLoginBody
  try {
    body = await req.json() as ClientLoginBody
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const { action, slug, countryCode, phone, pin, newPin, clientId, access_token } = body

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── Change PIN by clientId ───────────────────────────────────────────────────
  if (action === 'change-pin') {
    if (!newPin || !clientId) {
      return jsonResponse({ error: 'newPin and clientId are required' }, 400)
    }

    const { error: updateErr } = await supabaseAdmin
      .from('clients')
      .update({ pin: newPin, pin_changed: true })
      .eq('id', clientId)

    if (updateErr) {
      return jsonResponse({ error: updateErr.message }, 400)
    }

    return jsonResponse({ success: true }, 200)
  }

  // ── PIN update endpoint ──────────────────────────────────────────────────────
  if (newPin) {
    if (!access_token) {
      return jsonResponse({ error: 'access_token is required to update PIN' }, 400)
    }

    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(access_token)
    if (userErr || !user) {
      return jsonResponse({ error: 'Invalid or expired session' }, 401)
    }

    const { error: updateErr } = await supabaseAdmin
      .from('clients')
      .update({ pin: newPin, pin_changed: true })
      .eq('auth_user_id', user.id)

    if (updateErr) {
      return jsonResponse({ error: updateErr.message }, 500)
    }

    return jsonResponse({ success: true }, 200)
  }

  // ── Login endpoint ───────────────────────────────────────────────────────────
  if (!slug || !countryCode || !phone || !pin) {
    return jsonResponse({ error: 'slug, countryCode, phone and pin are required' }, 400)
  }

  const { data: salon } = await supabaseAdmin
    .from('salons')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  if (!salon) {
    return jsonResponse({ error: 'Salon not found' }, 404)
  }

  const fullPhone = `${countryCode}${phone.replace(/^0+/, '')}`

  let clientData = null

  const { data: c1 } = await supabaseAdmin
    .from('clients')
    .select('id, name, phone, pin_changed')
    .eq('salon_id', salon.id)
    .eq('phone', '+' + fullPhone)
    .maybeSingle()
  clientData = c1

  if (!clientData) {
    const { data: c2 } = await supabaseAdmin
      .from('clients')
      .select('id, name, phone, pin_changed')
      .eq('salon_id', salon.id)
      .eq('phone', fullPhone)
      .maybeSingle()
    clientData = c2
  }

  if (!clientData) {
    return jsonResponse({ error: 'Phone number not registered' }, 404)
  }

  const email = `${(clientData.phone as string).replace(/\s+/g, '')}@noorie-client.internal`

  const { data: authData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
    email,
    password: pin + 'x',
  })

  if (signInError || !authData.session) {
    return jsonResponse({ error: 'Incorrect PIN' }, 401)
  }

  return jsonResponse({
    client: {
      id: clientData.id,
      name: clientData.name,
      phone: clientData.phone,
      pin_changed: clientData.pin_changed,
    },
    session: authData.session,
  }, 200)
})
