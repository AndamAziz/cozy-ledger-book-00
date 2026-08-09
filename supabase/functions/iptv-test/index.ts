import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { isDirectStreamUrl, isM3uPlaylistUrl, isXtreamUrl, parseXtream } from '../_shared/iptvConfig.ts'
import { relayFetch, xtreamAuthError } from '../_shared/iptvFetch.ts'

// M3U files (especially GitHub-hosted playlists with thousands of lines) need
// time to download — a short deadline reported a false "Connection timed out".
const TIMEOUT_MS = 30_000
/** Xtream catalogue actions return multi-MB JSON — give them room. */
const CATALOGUE_TIMEOUT_MS = 60_000
/** Short deadline for the tiny sample playback probes. */
const PROBE_TIMEOUT_MS = 8_000


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // --- Auth: any signed-in user (they test their own personal server) ------
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

  // --- Validate input ------------------------------------------------------
  let body: { url?: unknown } = {}
  try {
    body = await req.json()
  } catch (_) {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const rawInput = typeof body.url === 'string' ? body.url.trim() : ''
  if (!rawInput || rawInput.length > 2048) return json({ error: 'A playlist URL is required' }, 400)

  // A pasted Xtream URL often already carries `action=get_live_streams`, whose
  // answer can be several MB — far too heavy for a quick handshake test. Strip
  // any `action` so the test starts from the tiny account endpoint; the
  // catalogue is then counted deliberately further down.
  let raw = rawInput
  try {
    const u = new URL(rawInput)
    if (u.searchParams.has('action') && /player_api\.php$/i.test(u.pathname)) {
      u.searchParams.delete('action')
      raw = u.toString()
    }
  } catch { /* not a URL — handled below */ }


  let creds: ReturnType<typeof parseXtream>
  try {
    creds = parseXtream(raw)
  } catch (_) {
    return json({ ok: false, error: 'That is not a valid URL' })
  }

  const started = performance.now()
  const latency = () => Math.round(performance.now() - started)

  // --- Direct single-stream link (.ts / .mp4 / raw stream path) ------------
  // Not a playlist: just confirm the stream responds; it is wrapped as a
  // one-channel source everywhere else in the pipeline.
  if (isDirectStreamUrl(raw) && !/\.m3u8(\?|#|$)/i.test(raw)) {
    const res = await relayFetch(raw, { timeoutMs: TIMEOUT_MS, maxBytes: 2048 })
    if (!res.ok && res.status !== 206) {
      return json({ ok: false, error: res.error ?? 'Could not reach the stream', status: res.status })
    }
    return json({
      ok: true,
      kind: 'stream',
      channels: 1,
      latency_ms: latency(),
      host: creds.host,
      via: res.userAgent,
      compatible: true,
      message: `Direct stream reachable — 1 channel in ${latency()} ms`,
    })
  }

  // --- Plain M3U / M3U8 playlist (no Xtream credentials) -------------------
  // A playlist pattern (get.php?type=m3u, /playlist, *.m3u, GitHub raw file) is
  // always read as text — never probed as an Xtream API endpoint.
  if (isM3uPlaylistUrl(raw) || !isXtreamUrl(raw)) {
    // Big playlists (tens of thousands of channels) must be read whole so the
    // channel count is accurate.
    const res = await relayFetch(raw, { timeoutMs: TIMEOUT_MS, maxBytes: 60_000_000 })
    if (!res.ok) return json({ ok: false, error: res.error ?? 'Could not reach the server', status: res.status })
    if (!/#EXTM3U|#EXTINF/i.test(res.body)) {
      return json({
        ok: false,
        error: `That link did not return an M3U playlist (content-type: ${res.contentType ?? 'unknown'})`,
      })
    }
    // An HLS manifest is a single stream, not a channel list.
    if (/#EXT-X-(TARGETDURATION|MEDIA-SEQUENCE|STREAM-INF|ENDLIST|MAP|KEY)/i.test(res.body)) {
      return json({
        ok: true,
        kind: 'stream',
        channels: 1,
        latency_ms: latency(),
        host: creds.host,
        via: res.userAgent,
        compatible: true,
        message: `Direct HLS stream reachable — 1 channel in ${latency()} ms`,
      })
    }
    const channels = (res.body.match(/#EXTINF/gi) ?? []).length
    if (!channels) return json({ ok: false, error: 'Connected, but no channels were returned' })

    // Sample probe: check the first few stream URLs in the playlist.
    const urls = res.body
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /^https?:\/\//i.test(l))
      .slice(0, 3)
    let onlineSample = 0
    for (const u of urls) {
      const probe = await relayFetch(u, { timeoutMs: PROBE_TIMEOUT_MS, maxBytes: 2048 })
      if (probe.ok || probe.status === 206) onlineSample += 1
    }
    const ratio = urls.length ? onlineSample / urls.length : 1
    return json({
      ok: true,
      kind: 'm3u',
      channels,
      live: channels,
      online: Math.round(channels * ratio),
      sample_tested: urls.length,
      sample_online: onlineSample,
      latency_ms: latency(),
      host: creds.host,
      via: res.userAgent,
      compatible: onlineSample > 0 || urls.length === 0,
      message: urls.length
        ? `Connected — ${channels} channels listed, ~${Math.round(channels * ratio)} online (${onlineSample}/${urls.length} sampled) in ${latency()} ms`
        : `Connected — ${channels} channels in ${latency()} ms`,
    })
  }


  // --- Probe the Xtream playlist -------------------------------------------
  const api = `${creds.protocol}//${creds.host}${creds.basePath}/player_api.php?username=${encodeURIComponent(
    creds.username,
  )}&password=${encodeURIComponent(creds.password)}`

  // 1. Account handshake: gives precise auth / connection-limit errors.
  const auth = await relayFetch(api, { timeoutMs: TIMEOUT_MS })
  if (!auth.ok) return json({ ok: false, error: auth.error ?? 'Could not reach the server', status: auth.status })
  const authProblem = xtreamAuthError(auth.body)
  if (authProblem) return json({ ok: false, error: authProblem })

  // 2. Channel list — several MB on large panels, so it gets the long deadline
  //    and a generous byte budget (a truncated body would fail parsing).
  const list = await relayFetch(`${api}&action=get_live_streams`, {
    timeoutMs: CATALOGUE_TIMEOUT_MS,
    maxBytes: 60_000_000,
  })
  // The account already authenticated, so a heavy/slow catalogue must not be
  // reported as a dead server — report the successful handshake instead.
  if (!list.ok) {
    return json({
      ok: true,
      kind: 'xtream',
      channels: null,
      latency_ms: latency(),
      host: creds.host,
      via: auth.userAgent,
      compatible: true,
      message: `Account authenticated in ${latency()} ms — channel list could not be counted (${
        list.error ?? `HTTP ${list.status}`
      })`,
    })
  }

  // Counting ids with a scan is far cheaper than JSON.parse on a multi-MB body.
  const countIds = (body: string, key: string) => (body.match(new RegExp(`"${key}"\\s*:`, 'g')) ?? []).length
  const liveCount = countIds(list.body, 'stream_id')
  if (!liveCount) {
    return json({ ok: false, error: 'Connected, but no channels were returned' })
  }
  const sampleIds = [...list.body.matchAll(/"stream_id"\s*:\s*"?(\d+)"?/g)].slice(0, 3).map((m) => m[1])

  // 3. Catalogue sizes (sequential — the provider allows one connection).
  const countOf = async (action: string, key: string) => {
    const r = await relayFetch(`${api}&action=${action}`, {
      timeoutMs: CATALOGUE_TIMEOUT_MS,
      maxBytes: 60_000_000,
    })
    if (!r.ok) return null
    const n = countIds(r.body, key)
    return n || null
  }


  const vodCount = await countOf('get_vod_streams', 'stream_id')
  const seriesCount = await countOf('get_series', 'series_id')

  // 4. Sample playback probe: how many of the first channels really answer.
  const sample = sampleIds
  let onlineSample = 0
  for (const id of sample) {
    const target = `${creds.protocol}//${creds.host}${creds.basePath}/live/${encodeURIComponent(creds.username)}/${encodeURIComponent(
      creds.password,
    )}/${id}.ts`
    const probe = await relayFetch(target, { timeoutMs: PROBE_TIMEOUT_MS, maxBytes: 2048 })
    if (probe.ok || probe.status === 206) onlineSample += 1
  }


  return json({
    ok: true,
    kind: 'xtream',
    channels: liveCount,
    live: liveCount,
    vod: vodCount,
    series: seriesCount,
    online: onlineSample > 0 ? liveCount : 0,
    sample_tested: sample.length,
    sample_online: onlineSample,
    latency_ms: latency(),
    host: creds.host,
    via: list.userAgent,
    compatible: onlineSample > 0,
    message:
      onlineSample > 0
        ? `Connected — ${liveCount} live channels online (${onlineSample}/${sample.length} sampled playing) in ${latency()} ms`
        : `Connected — ${liveCount} live channels listed, but none of the ${sample.length} sampled channels are playing`,
  })
})

