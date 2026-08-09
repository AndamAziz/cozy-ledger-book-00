import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { isXtreamUrl, xtreamApiBase } from '../_shared/iptvConfig.ts'
import { resolveViewer, serviceClient } from '../_shared/iptvViewer.ts'
import { maskPlaylistUrl } from '../_shared/iptvCrypto.ts'
import { egressFetch } from '../_shared/iptvEgress.ts'
import { relayFetch, xtreamAuthError, IPTV_USER_AGENTS, isHtmlBlock } from '../_shared/iptvFetch.ts'

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

// Health is per provider account, so it is cached per user.
const cache = new Map<string, { at: number; health: Health }>()

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

/**
 * Xtream account check.
 *
 * The API base (including the correct scheme for TLS-only ports such as 2087)
 * comes from the same `xtreamApiBase` helper the catalogue uses, and the request
 * goes through `relayFetch`, which rotates the three player User-Agents and
 * treats an HTML block page as a failure.
 */
async function checkXtream(source: string): Promise<Health> {
  const api = xtreamApiBase(source)
  const res = await relayFetch(api, { timeoutMs: TIMEOUT_MS })

  if (!res.ok) {
    return base('offline', res.error ?? `Provider responded ${res.status}`)
  }
  if (isHtmlBlock(res.contentType, res.body)) {
    return base('offline', 'Provider answered a block page (HTML) instead of account data')
  }

  let info: Record<string, unknown> = {}
  try {
    const json = JSON.parse(res.body)
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

  const authProblem = xtreamAuthError(res.body)
  if (!authed || (accStatus && accStatus !== 'active')) {
    return {
      ...base('offline', authProblem ?? (accStatus ? `Account ${accStatus}` : 'Provider rejected the credentials')),
      activeConnections: active,
      maxConnections: max,
      expiresAt,
    }
  }

  const slotFull = max !== null && max > 0 && active !== null && active >= max
  const slotMessage =
    max !== null && max > 0
      ? active !== null
        ? slotFull
          ? `All ${max} viewing slots are in use`
          : `${active}/${max} viewing slots in use`
        : `${max} viewing slots · slot status unknown`
      : 'Provider is reachable'

  return {
    ...base(slotFull ? 'slot_limit' : 'online', slotMessage),
    activeConnections: active,
    maxConnections: max,
    expiresAt,
  }
}

/**
 * Plain M3U check — a 1 KB ranged read, retried across the player User-Agents.
 * The body is never buffered (playlists can be tens of MB).
 */
async function checkPlainM3U(source: string): Promise<Health> {
  let last: Health = base('offline', 'Playlist unreachable')
  for (const ua of IPTV_USER_AGENTS) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const res = await egressFetch(source, {
        headers: { 'User-Agent': ua, Range: 'bytes=0-1024' },
        signal: ctrl.signal,
      })
      const ctype = res.headers.get('content-type')
      await res.body?.cancel().catch(() => {})
      if (res.status === 458 || res.status === 429 || res.status === 407) {
        return base('slot_limit', 'Provider connection limit reached')
      }
      if (res.ok && isHtmlBlock(ctype)) {
        last = base('offline', 'Playlist host answered a block page (HTML)')
        continue
      }
      if (!res.ok) {
        last = base('offline', `Playlist responded ${res.status}`)
        continue
      }
      return base('online', 'Playlist is reachable')
    } catch (e) {
      last = base(
        'offline',
        e instanceof Error && e.name === 'AbortError' ? 'Playlist timed out' : 'Playlist unreachable',
      )
    } finally {
      clearTimeout(timer)
    }
  }
  return last
}

/**
 * Persist the verdict on the matching `iptv_sources` row so the admin panel
 * shows live status without anyone pressing "Test". Matching is done on the
 * masked URL, so a source assigned to another user is updated too.
 */
async function persistHealth(playlistUrl: string, health: Health) {
  const masked = maskPlaylistUrl(playlistUrl)
  if (!masked) return
  try {
    await serviceClient()
      .from('iptv_sources')
      .update({
        health_status: health.status,
        health_message: health.message,
        health_checked_at: health.checkedAt,
      })
      .eq('playlist_masked', masked)
  } catch (e) {
    console.error('[iptv-health] persist failed', e instanceof Error ? e.message : e)
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

  const resolved = await resolveViewer(req)
  if (!resolved.ok) {
    return json({ ...base('offline', resolved.message), code: resolved.error })
  }
  const source = resolved.viewer.playlistUrl

  const hit = cache.get(resolved.viewer.userId)
  if (!fresh && hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return json({ ...hit.health, cached: true })
  }

  let health: Health
  try {
    health = isXtreamUrl(source) ? await checkXtream(source) : await checkPlainM3U(source)
  } catch (e) {
    health = base('offline', e instanceof Error && e.name === 'AbortError' ? 'Provider timed out' : 'Provider unreachable')
  }

  cache.set(resolved.viewer.userId, { at: Date.now(), health })
  if (cache.size > 500) cache.delete(cache.keys().next().value as string)
  await persistHealth(source, health)
  return json({ ...health, cached: false })
})
