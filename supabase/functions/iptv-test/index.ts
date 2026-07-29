import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { isXtreamUrl, parseXtream } from '../_shared/iptvConfig.ts'


const UA = 'VLC/3.0.20 LibVLC/3.0.20'
const TIMEOUT_MS = 15000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // --- Auth: admins only ---------------------------------------------------
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
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
    return json({ ok: false, error: 'That is not a valid URL' }, 200)
  }
  if (!/^https?:$/.test(creds.protocol)) {
    return json({ ok: false, error: 'URL must start with http:// or https://' }, 200)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const started = performance.now()

  // --- Plain M3U / M3U8 playlist (no Xtream credentials) -------------------
  if (!isXtreamUrl(raw)) {
    try {
      const res = await fetch(raw, {
        headers: { 'User-Agent': UA },
        redirect: 'follow',
        signal: controller.signal,
      })
      if (!res.ok) return json({ ok: false, error: `Server responded with ${res.status}` }, 200)
      const text = await res.text()
      if (!/#EXTM3U|#EXTINF/i.test(text)) {
        return json({ ok: false, error: 'That link did not return an M3U playlist' }, 200)
      }
      const channels = (text.match(/#EXTINF/gi) ?? []).length
      if (!channels) return json({ ok: false, error: 'Connected, but no channels were returned' }, 200)
      return json({
        ok: true,
        channels,
        latency_ms: Math.round(performance.now() - started),
        host: creds.host,
      })
    } catch (e) {
      const timedOut = (e as Error)?.name === 'AbortError'
      return json({ ok: false, error: timedOut ? 'Connection timed out' : 'Could not reach the server' }, 200)
    } finally {
      clearTimeout(timer)
    }
  }

  // --- Probe the Xtream playlist -------------------------------------------
  const api = `${creds.protocol}//${creds.host}/player_api.php?username=${encodeURIComponent(
    creds.username,
  )}&password=${encodeURIComponent(creds.password)}`

  try {
    const res = await fetch(`${api}&action=get_live_streams`, {
      headers: { 'User-Agent': UA },
      signal: controller.signal,
    })
    const text = await res.text()
    if (!res.ok) return json({ ok: false, error: `Server responded with ${res.status}` }, 200)

    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (_) {
      return json({ ok: false, error: 'Server did not return a channel list' }, 200)
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return json({ ok: false, error: 'Connected, but no channels were returned' }, 200)
    }

    return json({
      ok: true,
      channels: parsed.length,
      latency_ms: Math.round(performance.now() - started),
      host: creds.host,
    })
  } catch (e) {
    const timedOut = (e as Error)?.name === 'AbortError'
    return json({ ok: false, error: timedOut ? 'Connection timed out' : 'Could not reach the server' }, 200)
  } finally {
    clearTimeout(timer)
  }
})

