import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { getPlaylistUrl, parseXtream, isXtreamUrl } from '../_shared/iptvConfig.ts'

const UA = 'VLC/3.0.20 LibVLC/3.0.20'
const TIMEOUT_MS = 6000
/** Provider health is cheap but not free — reuse a recent result for this long. */
const CACHE_TTL_MS = 20_000

export type ProviderStatus = 'online' | 'slot_limit' | 'offline'

interface Health {
  status: ProviderStatus
  message: string
  activeConnections: number | null
  maxConnections: number | null
  expiresAt: string | null
  checkedAt: string
}

let cache: { at: number; health: Health } | null = null

async function timedFetch(url: string, init: RequestInit = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, {
      ...init,
      headers: { 'User-Agent': UA, ...(init.headers ?? {}) },
      redirect: 'follow',
      signal: ctrl.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

async function checkXtream(source: string): Promise<Health> {
  const { host, username, password } = parseXtream(source)
  const api = `http://${host}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`

  const res = await timedFetch(api, { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    return base('offline', `Provider responded ${res.status}`)
  }

  let info: Record<string, unknown> = {}
  try {
    const json = await res.json()
    info = (json?.user_info ?? {}) as Record<string, unknown>
  } catch {
    return base('offline', 'Provider returned an unreadable response')
  }

  const num = (v: unknown) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  const active = num(info.active_cons)
  const max = num(info.max_connections)
  const authed = Number(info.auth ?? 1) === 1
  const accStatus = String(info.status ?? '').toLowerCase()
  const expTs = num(info.exp_date)
  const expiresAt = expTs ? new Date(expTs * 1000).toISOString() : null

  if (!authed || (accStatus && accStatus !== 'active')) {
    return {
      ...base('offline', accStatus ? `Account ${accStatus}` : 'Provider rejected the credentials'),
      activeConnections: active,
      maxConnections: max,
      expiresAt,
    }
  }

  const slotFull = max !== null && max > 0 && active !== null && active >= max
  return {
    ...base(
      slotFull ? 'slot_limit' : 'online',
      slotFull
        ? `All ${max} viewing slots are in use`
        : max
          ? `${active ?? 0}/${max} viewing slots in use`
          : 'Provider is reachable',
    ),
    activeConnections: active,
    maxConnections: max,
    expiresAt,
  }
}

async function checkPlainM3U(source: string): Promise<Health> {
  const res = await timedFetch(source, { headers: { Range: 'bytes=0-1024' } })
  await res.body?.cancel()
  if (res.status === 458 || res.status === 429 || res.status === 407) return base('slot_limit', 'Provider connection limit reached')
  if (!res.ok) return base('offline', `Playlist responded ${res.status}`)
  return base('online', 'Playlist is reachable')
}

function base(status: ProviderStatus, message: string): Health {
  return {
    status,
    message,
    activeConnections: null,
    maxConnections: null,
    expiresAt: null,
    checkedAt: new Date().toISOString(),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })

  const fresh = new URL(req.url).searchParams.get('fresh') === '1'
  if (!fresh && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return json({ ...cache.health, cached: true })
  }

  const source = await getPlaylistUrl()
  if (!source) return json(base('offline', 'Playlist not configured'))

  let health: Health
  try {
    health = isXtreamUrl(source) ? await checkXtream(source) : await checkPlainM3U(source)
  } catch (e) {
    health = base('offline', e instanceof Error && e.name === 'AbortError' ? 'Provider timed out' : 'Provider unreachable')
  }

  cache = { at: Date.now(), health }
  return json({ ...health, cached: false })
})
