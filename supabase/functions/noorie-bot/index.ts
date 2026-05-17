import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface RequestBody {
  model: string
  max_tokens: number
  system: string
  tools: unknown[]
  messages: unknown[]
  salonId: string
}

function jsonResponse(body: unknown, status: number): Response {
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

  // Verify caller is authenticated via Supabase JWT
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  let body: RequestBody
  try {
    body = await req.json() as RequestBody
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const { model, max_tokens, system, tools, messages, salonId } = body
  if (!model || !max_tokens || !system || !tools || !messages || !salonId) {
    return jsonResponse({ error: 'Missing required fields: model, max_tokens, system, tools, messages, salonId' }, 400)
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return jsonResponse({ error: 'Server misconfiguration: missing API key' }, 500)
  }

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens,
      system,
      tools,
      messages,
    }),
  })

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text()
    return jsonResponse({ error: `Anthropic API error ${anthropicRes.status}: ${errText}` }, 502)
  }

  const data = await anthropicRes.json()
  return jsonResponse(data, 200)
})
