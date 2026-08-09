import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { isXtreamUrl, parseXtream } from '../_shared/iptvConfig.ts'
import { decryptSecret } from '../_shared/iptvCrypto.ts'
import { diagFetchRaw, redactUrl, type UpstreamDiag } from '../_shared/iptvDiag.ts'

/**
 * Lightweight stream-resolver probe for the admin server list.
 *
 * It walks exactly the same path the player takes (Xtream live stream URL via
 * the egress relay) using the SHARED diagFetch helper, so a failing row reports
 * an errorKind + status instead of a generic red X.
 */

const UA = 'IPTVSmartersPro/4.0.4 (Linux; Android 12) ExoPlayerLib/2.19.1'
const TIMEOUT_MS = 15_000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const reqId = crypto.randomUUID().slice(0, 8)
  let lastDiag: UpstreamDiag | null = null
  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify({ reqId, upstream: lastDiag, ...body }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ error: 'Unauthorized' }, 401)

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
  const { data: userData } = await db.auth.getUser(token)
  const user = userData?.user
  if (!user) return json({ error: 'Unauthorized' }, 401)

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { data: isAdminData } = await db.rpc('has_role', { _user_id: user.id, _role: 'admin' })
  const isAdmin = !!isAdminData
  const requested = typeof body.userId === 'string' ? body.userId.trim() : ''
  const ownerId = !requested || requested === user.id ? user.id : isAdmin ? requested : null
  if (!ownerId) return json({ error: 'Forbidden' }, 403)

  const sourceId = typeof body.sourceId === 'string' ? body.sourceId : ''
  if (!sourceId) return json({ error: 'A source is required' }, 400)

  const { data: row } = await db
    .from('iptv_sources')
    .select('id, name, playlist_enc')
    .eq('id', sourceId)
    .eq('user_id', ownerId)
    .maybeSingle()
  if (!row) return json({ error: 'Source not found' }, 404)

  const playlist = (await decryptSecret(row.playlist_enc as string | null)) ?? ''
  if (!playlist) return json({ error: 'This source has no stored URL' }, 400)

  const headers: Record<string, string> = {
    'User-Agent': UA,
    Accept: '*/*',
    'Accept-Encoding': 'identity',
  }
  const capture = (d: UpstreamDiag) => {
    lastDiag = d
  }
  const fail = (diag: UpstreamDiag, target: string) =>
    json({
      ok: false,
      errorKind: diag.kind ?? 'unknown',
      status: diag.status,
      statusText: diag.statusText ?? null,
      latency_ms: diag.durationMs,
      message: diag.message ?? 'Upstream request failed',
      url: redactUrl(target),
    })

  // --- Plain M3U: the playlist itself is what the player loads --------------
  if (!isXtreamUrl(playlist)) {
    const { res, diag } = await diagFetchRaw('stream-test:m3u', playlist, {
      timeoutMs: TIMEOUT_MS,
      headers,
      onDiag: capture,
    })
    if (!res || !res.ok) return fail(diag, playlist)
    await res.body?.cancel().catch(() => undefined)
    return json({ ok: true, latency_ms: diag.durationMs, status: diag.status, url: redactUrl(playlist) })
  }

  // --- Xtream: resolve a live stream id, then probe the stream URL ----------
  const { host, protocol, username, password } = parseXtream(playlist)
  const api = `${protocol}//${host}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
  const requestedCategory = typeof body.categoryId === 'string' && body.categoryId ? body.categoryId : ''

  /** First stream_id in a category, or '' when the category is genuinely empty. */
  const firstStreamOf = async (categoryId: string) => {
    const listUrl = `${api}&action=get_live_streams&category_id=${encodeURIComponent(categoryId)}`
    const { res, diag } = await diagFetchRaw('stream-test:list', listUrl, {
      timeoutMs: TIMEOUT_MS,
      headers,
      onDiag: capture,
    })
    if (!res || !res.ok) return { error: fail(diag, listUrl) }
    try {
      const arr = await res.json()
      return { id: String((Array.isArray(arr) ? arr[0]?.stream_id : '') ?? '') }
    } catch (e) {
      return {
        error: json({
          ok: false,
          errorKind: 'parse_error',
          status: diag.status,
          latency_ms: diag.durationMs,
          message: e instanceof Error ? e.message : 'Invalid JSON from provider',
          url: redactUrl(listUrl),
        }),
      }
    }
  }

  let streamId = typeof body.streamId === 'string' ? body.streamId : ''
  let probedCategory = requestedCategory
  if (!streamId) {
    // Category ids differ per panel — never assume a fixed one. Discover the
    // real list and walk it until a category actually holds channels; empty
    // categories are normal upstream and must not fail the source.
    const candidates: string[] = requestedCategory ? [requestedCategory] : []
    if (!requestedCategory) {
      const catUrl = `${api}&action=get_live_categories`
      const { res, diag } = await diagFetchRaw('stream-test:categories', catUrl, {
        timeoutMs: TIMEOUT_MS,
        headers,
        onDiag: capture,
      })
      if (!res || !res.ok) return fail(diag, catUrl)
      try {
        const arr = await res.json()
        if (Array.isArray(arr)) {
          for (const c of arr) {
            const id = String((c as { category_id?: unknown })?.category_id ?? '')
            if (id) candidates.push(id)
          }
        }
      } catch (e) {
        return json({
          ok: false,
          errorKind: 'parse_error',
          status: diag.status,
          latency_ms: diag.durationMs,
          message: e instanceof Error ? e.message : 'Invalid JSON from provider',
          url: redactUrl(catUrl),
        })
      }
      if (!candidates.length) {
        return json({
          ok: false,
          errorKind: 'empty_catalogue',
          status: diag.status,
          latency_ms: diag.durationMs,
          message: 'Provider returned no live categories',
          url: redactUrl(catUrl),
        })
      }
    }

    let emptyCategories = 0
    for (const candidate of candidates.slice(0, 8)) {
      const result = await firstStreamOf(candidate)
      if (result.error) return result.error
      if (result.id) {
        streamId = result.id
        probedCategory = candidate
        break
      }
      emptyCategories += 1
    }

    if (!streamId) {
      return json({
        ok: false,
        errorKind: 'empty_catalogue',
        status: 200,
        message: requestedCategory
          ? `Category ${requestedCategory} is empty on this provider`
          : `No channels found in the first ${emptyCategories} categories`,
        url: redactUrl(api),
      })
    }
  }


  const target = `${protocol}//${host}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${streamId}.ts`
  const { res, diag } = await diagFetchRaw('stream-test:live', target, {
    timeoutMs: TIMEOUT_MS,
    headers,
    onDiag: capture,
  })
  if (!res || !res.ok) return fail(diag, target)
  // Release the provider slot immediately — single-slot accounts are common.
  await res.body?.cancel().catch(() => undefined)
  return json({
    ok: true,
    latency_ms: diag.durationMs,
    status: diag.status,
    streamId,
    contentType: diag.headers?.['content-type'] ?? null,
    url: redactUrl(target),
  })
})
