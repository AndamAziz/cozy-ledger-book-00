import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { isXtreamUrl, parseXtream } from '../_shared/iptvConfig.ts'
import { relayFetch, xtreamAuthError } from '../_shared/iptvFetch.ts'

const TIMEOUT_MS = 10_000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // --- Auth: admins only ---------------------------------------------------
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Unauthorized' }, 401)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const { data: userData, error: userErr } = await admin.auth.getUser(token)
  const user = userData?.user
  if (userErr || !user) return json({ error: 'Unauthorized' }, 401)

  const { data: isAdmin } = await admin.rpc('has_role', { _user_id: user.id, _role: 'admin' })
  if (!isAdmin) return json({ error: 'Forbidden' }, 403)

  // --- Validate input ------------------------------------------------------
  let body: { url?: unknown } = {}
  try {
    body = await req.json()
  } catch (_) {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const raw = typeof body.url === 'string' ? body.url.trim() : ''
  if (!raw || raw.length > 2048) return json({ error: 'A playlist URL is required' }, 400)

  let creds: ReturnType<typeof parseXtream>
  try {
    creds = parseXtream(raw)
  } catch (_) {
    return json({ ok: false, error: 'That is not a valid URL' })
  }

  const started = performance.now()
  const latency = () => Math.round(performance.now() - started)

  // --- Plain M3U / M3U8 playlist (no Xtream credentials) -------------------
  if (!isXtreamUrl(raw)) {
    const res = await relayFetch(raw, { timeoutMs: TIMEOUT_MS })
    if (!res.ok) return json({ ok: false, error: res.error ?? 'Could not reach the server', status: res.status })
    if (!/#EXTM3U|#EXTINF/i.test(res.body)) {
      return json({
        ok: false,
        error: `That link did not return an M3U playlist (content-type: ${res.contentType ?? 'unknown'})`,
      })
    }
    const channels = (res.body.match(/#EXTINF/gi) ?? []).length
    if (!channels) return json({ ok: false, error: 'Connected, but no channels were returned' })
    return json({ ok: true, channels, latency_ms: latency(), host: creds.host, via: res.userAgent })
  }

  // --- Probe the Xtream playlist -------------------------------------------
  const api = `${creds.protocol}//${creds.host}/player_api.php?username=${encodeURIComponent(
    creds.username,
  )}&password=${encodeURIComponent(creds.password)}`

  // 1. Account handshake: gives precise auth / connection-limit errors.
  const auth = await relayFetch(api, { timeoutMs: TIMEOUT_MS })
  if (!auth.ok) return json({ ok: false, error: auth.error ?? 'Could not reach the server', status: auth.status })
  const authProblem = xtreamAuthError(auth.body)
  if (authProblem) return json({ ok: false, error: authProblem })

  // 2. Channel list.
  const list = await relayFetch(`${api}&action=get_live_streams`, { timeoutMs: TIMEOUT_MS })
  if (!list.ok) return json({ ok: false, error: list.error ?? 'Could not reach the server', status: list.status })

  let parsed: unknown
  try {
    parsed = JSON.parse(list.body)
  } catch (_) {
    return json({ ok: false, error: 'Server did not return a channel list (invalid JSON response)' })
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return json({ ok: false, error: 'Connected, but no channels were returned' })
  }

  return json({
    ok: true,
    channels: parsed.length,
    latency_ms: latency(),
    host: creds.host,
    via: list.userAgent,
  })
})
