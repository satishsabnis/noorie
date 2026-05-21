import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface CreateClientUserBody {
  clientId: string
  phone: string
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

  let body: CreateClientUserBody
  try {
    body = await req.json() as CreateClientUserBody
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400)
  }

  const { clientId, phone, pin } = body
  if (!clientId || !phone || !pin) {
    return jsonResponse({ success: false, error: 'clientId, phone and pin are required' }, 400)
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const email = `${phone.replace(/\s+/g, '')}@noorie-client.internal`
  const authPassword = pin + 'x'

  // Try to find an existing auth user with this email
  const { data: listData } = await supabaseAdmin.auth.admin.listUsers()
  const existing = listData?.users?.find(u => u.email === email)

  let authUserId: string

  if (existing) {
    // Update password for existing user
    const { data: updData, error: updErr } = await supabaseAdmin.auth.admin.updateUserById(
      existing.id,
      { password: authPassword }
    )
    if (updErr || !updData.user) {
      return jsonResponse({ success: false, error: updErr?.message ?? 'Failed to update auth user' }, 400)
    }
    authUserId = existing.id
  } else {
    // Create new auth user
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: authPassword,
      email_confirm: true,
    })
    if (authErr || !authData.user) {
      return jsonResponse({ success: false, error: authErr?.message ?? 'Failed to create auth user' }, 400)
    }
    authUserId = authData.user.id
  }

  const { error: clientErr } = await supabaseAdmin
    .from('clients')
    .update({ auth_user_id: authUserId })
    .eq('id', clientId)

  if (clientErr) {
    return jsonResponse({ success: false, error: clientErr.message }, 400)
  }

  return jsonResponse({ success: true, auth_user_id: authUserId }, 200)
})
