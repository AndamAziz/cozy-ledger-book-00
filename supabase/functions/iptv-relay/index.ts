import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { relayFetch, xtreamAuthError } from '../_shared/iptvFetch.ts'

/**
 * Generic server-to-server relay for IPTV provider URLs.
 * POST { url } -> { success, status, data } | { success: false, error }
 * Admin-only: it can fetch arbitrary URLs, so it must never be public.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405)

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ success: false, error: 'Unauthorized' }, 401)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
  const { data: userData } = await admin.auth.getUser(token)
  const user = userData?.user
  if (!user) return json({ success: false, error: 'Unauthorized' }, 401)
  const { data: isAdmin } = await admin.rpc('has_role', { _user_id: user.id, _role: 'admin' })
  if (!isAdmin) return json({ success: false, error: 'Forbidden' }, 403)

  let body: { url?: unknown } = {}
  try {
    body = await req.json()
  } catch (_) {
    return json({ success: false, error: 'Invalid JSON body' }, 400)
  }
  const url = typeof body.url === 'string' ? body.url.trim() : ''
  if (!url || url.length > 2048) return json({ success: false, error: 'A url is required' }, 400)

  const res = await relayFetch(url, { timeoutMs: 10_000 })
  if (!res.ok) {
    return json({ success: false, status: res.status, error: res.error ?? 'Could not reach the server' })
  }

  const authProblem = xtreamAuthError(res.body)
  if (authProblem) return json({ success: false, status: res.status, error: authProblem })

  let data: unknown = res.body
  if ((res.contentType ?? '').includes('json')) {
    try {
      data = JSON.parse(res.body)
    } catch (_) {
      // keep the raw text
    }
  }

  return json({ success: true, status: res.status, contentType: res.contentType, data })
})
