import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { decryptSecret, encryptSecret, maskPlaylistUrl } from '../_shared/iptvCrypto.ts'

/**
 * Secure vault for per-user IPTV credentials.
 *
 * The `user_iptv_servers` table is unreachable from the browser (no grants, no
 * policies). Everything goes through here so the playlist URL can be encrypted
 * before it is stored and only ever leaves as a masked preview.
 */

const admin = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ error: 'Unauthorized' }, 401)

  const db = admin()
  const { data: userData } = await db.auth.getUser(token)
  const user = userData?.user
  if (!user) return json({ error: 'Unauthorized' }, 401)

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const action = String(body.action ?? 'get')
  const { data: isAdminData } = await db.rpc('has_role', { _user_id: user.id, _role: 'admin' })
  const isAdmin = !!isAdminData
  // Only the CEO may create, replace or delete provider links — for anyone.
  const isCeo = (user.email ?? '').toLowerCase() === 'andam@outlook.com'

  /** Encrypts + stores, returning the masked preview. Never logs the URL. */
  const store = async (userId: string, rawUrl: string) => {
    const url = rawUrl.trim()
    if (url && (!/^https?:\/\//i.test(url) || url.length > 2048)) {
      return json({ error: 'Enter a full http(s) playlist or Xtream URL' }, 400)
    }
    const masked = url ? maskPlaylistUrl(url) : ''
    const { error } = await db.from('user_iptv_servers').upsert(
      {
        user_id: userId,
        playlist_url: '',
        playlist_enc: url ? await encryptSecret(url) : null,
        playlist_masked: masked,
        provider_name: typeof body.providerName === 'string' ? body.providerName : null,
        assigned_by: userId === user.id ? null : user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    if (error) return json({ error: 'Could not save your IPTV server' }, 500)
    return json({ ok: true, hasServer: !!url, masked })
  }

  /** Masked view of one row, migrating any legacy plaintext to ciphertext. */
  const readMasked = async (userId: string) => {
    const { data } = await db
      .from('user_iptv_servers')
      .select('playlist_url, playlist_enc, playlist_masked, provider_name, updated_at')
      .eq('user_id', userId)
      .maybeSingle()
    if (!data) return { hasServer: false, masked: '', providerName: null, updatedAt: null }

    const legacy = String(data.playlist_url ?? '').trim()
    if (legacy) {
      // One-time migration of rows written before encryption existed.
      await db
        .from('user_iptv_servers')
        .update({
          playlist_url: '',
          playlist_enc: await encryptSecret(legacy),
          playlist_masked: maskPlaylistUrl(legacy),
        })
        .eq('user_id', userId)
      return {
        hasServer: true,
        masked: maskPlaylistUrl(legacy),
        providerName: data.provider_name ?? null,
        updatedAt: data.updated_at ?? null,
      }
    }

    const hasServer = !!(await decryptSecret(data.playlist_enc as string | null))
    return {
      hasServer,
      masked: hasServer ? String(data.playlist_masked ?? '') : '',
      providerName: data.provider_name ?? null,
      updatedAt: data.updated_at ?? null,
    }
  }

  /** Target account for source actions: self, or another user when admin. */
  const ownerId = (): string | null => {
    const requested = typeof body.userId === 'string' ? body.userId.trim() : ''
    if (!requested || requested === user.id) return user.id
    return isAdmin && /^[0-9a-f-]{36}$/i.test(requested) ? requested : null
  }

  /** Mirrors the currently active source into the single-server vault row. */
  const syncActive = async (userId: string) => {
    const { data } = await db
      .from('iptv_sources')
      .select('name, playlist_enc, playlist_masked')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle()
    await db.from('user_iptv_servers').upsert(
      {
        user_id: userId,
        playlist_url: '',
        playlist_enc: (data?.playlist_enc as string | null) ?? null,
        playlist_masked: String(data?.playlist_masked ?? ''),
        provider_name: (data?.name as string | null) ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
  }

  /** Switches the active source atomically (unique partial index enforces one). */
  const setActive = async (userId: string, id: string): Promise<boolean> => {
    await db.from('iptv_sources').update({ is_active: false }).eq('user_id', userId).eq('is_active', true)
    const { error } = await db
      .from('iptv_sources')
      .update({ is_active: true })
      .eq('id', id)
      .eq('user_id', userId)
    if (error) return false
    await syncActive(userId)
    return true
  }

  /**
   * The CEO account keeps the two reference sources ready to test/switch:
   * a public iptv-org M3U and the Xtream provider account.
   */
  const seedCeoDefaults = async (userId: string) => {
    let email = user.id === userId ? (user.email ?? '') : ''
    if (!email) {
      const { data } = await db.auth.admin.getUserById(userId)
      email = data?.user?.email ?? ''
    }
    if (email.toLowerCase() !== 'andam@outlook.com') return
    const { count } = await db
      .from('iptv_sources')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
    if (count) return
    const defaults = [
      {
        name: 'Source A — Iraq (public M3U)',
        kind: 'm3u',
        url: 'https://iptv-org.github.io/iptv/countries/iq.m3u',
      },
      {
        name: 'Source B — MyRestreamer (Xtream)',
        kind: 'xtream',
        url: 'http://myrestreamer.com:8080/player_api.php?username=162360837276&password=6a69c61558b80',
      },
    ]
    for (const [i, d] of defaults.entries()) {
      await db.from('iptv_sources').insert({
        user_id: userId,
        name: d.name,
        kind: d.kind,
        playlist_enc: await encryptSecret(d.url),
        playlist_masked: maskPlaylistUrl(d.url),
        is_active: i === 0,
        created_by: user.id,
      })
    }
    await syncActive(userId)
  }

  switch (action) {

    case 'admin_save': {
      if (!isCeo) return json({ error: 'Forbidden' }, 403)
      const targetId = String(body.userId ?? '')
      if (!/^[0-9a-f-]{36}$/i.test(targetId)) return json({ error: 'Invalid user' }, 400)
      return await store(targetId, String(body.playlistUrl ?? ''))
    }

    case 'get':
      return json(await readMasked(user.id))

    case 'save':
      if (!isCeo) return json({ error: 'Forbidden' }, 403)
      return await store(user.id, String(body.playlistUrl ?? ''))

    case 'clear':
      if (!isCeo) return json({ error: 'Forbidden' }, 403)
      return await store(user.id, '')

    case 'admin_list': {
      if (!isAdmin) return json({ error: 'Forbidden' }, 403)
      const { data } = await db
        .from('user_iptv_servers')
        .select('user_id, playlist_url, playlist_enc, playlist_masked, provider_name, updated_at')
      const rows = await Promise.all(
        (data ?? []).map(async (r) => {
          const legacy = String(r.playlist_url ?? '').trim()
          const hasServer = legacy
            ? true
            : !!(await decryptSecret(r.playlist_enc as string | null))
          return {
            userId: r.user_id as string,
            hasServer,
            masked: legacy ? maskPlaylistUrl(legacy) : String(r.playlist_masked ?? ''),
            providerName: r.provider_name ?? null,
            updatedAt: r.updated_at ?? null,
          }
        }),
      )
      return json({ rows })
    }

    // ---- Multi-source management -------------------------------------
    // Each row in `iptv_sources` is an independent playlist (own credentials,
    // own channels). Exactly one row per user can be active; the active one is
    // mirrored into `user_iptv_servers` so playback/health keep one entry point.
    case 'list_sources': {
      const targetId = ownerId()
      if (!targetId) return json({ error: 'Forbidden' }, 403)
      await seedCeoDefaults(targetId)
      const { data } = await db
        .from('iptv_sources')
        .select('id, name, kind, playlist_masked, is_active, last_test, updated_at')
        .eq('user_id', targetId)
        .order('created_at')
      return json({ sources: data ?? [] })
    }


    case 'save_source': {
      const targetId = ownerId()
      if (!targetId) return json({ error: 'Forbidden' }, 403)
      const id = typeof body.id === 'string' ? body.id : null
      const name = String(body.name ?? '').trim().slice(0, 80) || 'My source'
      const rawUrl = String(body.playlistUrl ?? '').trim()
      if (rawUrl && (!/^https?:\/\//i.test(rawUrl) || rawUrl.length > 2048)) {
        return json({ error: 'Enter a full http(s) playlist or Xtream URL' }, 400)
      }
      if (!id && !rawUrl) return json({ error: 'A playlist URL is required' }, 400)

      const kind = /player_api\.php|\/get\.php|username=/i.test(rawUrl) ? 'xtream' : 'm3u'
      const patch: Record<string, unknown> = { name, updated_at: new Date().toISOString() }
      if (rawUrl) {
        patch.playlist_enc = await encryptSecret(rawUrl)
        patch.playlist_masked = maskPlaylistUrl(rawUrl)
        patch.kind = kind
        patch.last_test = body.lastTest ?? null
      }

      if (id) {
        const { error } = await db.from('iptv_sources').update(patch).eq('id', id).eq('user_id', targetId)
        if (error) return json({ error: 'Could not update that source' }, 500)
        if (rawUrl) await syncActive(targetId)
        return json({ ok: true, id })
      }

      const { data, error } = await db
        .from('iptv_sources')
        .insert({ ...patch, user_id: targetId, created_by: user.id })
        .select('id')
        .single()
      if (error) return json({ error: 'Could not add that source' }, 500)
      // First source becomes the active one automatically.
      const { count } = await db
        .from('iptv_sources')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', targetId)
        .eq('is_active', true)
      if (!count) await setActive(targetId, data.id as string)
      return json({ ok: true, id: data.id })
    }

    case 'activate_source': {
      const targetId = ownerId()
      if (!targetId) return json({ error: 'Forbidden' }, 403)
      const id = String(body.id ?? '')
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Invalid source' }, 400)
      const ok = await setActive(targetId, id)
      return ok ? json({ ok: true }) : json({ error: 'Could not switch source' }, 500)
    }

    case 'delete_source': {
      const targetId = ownerId()
      if (!targetId) return json({ error: 'Forbidden' }, 403)
      const id = String(body.id ?? '')
      const { data: row } = await db
        .from('iptv_sources')
        .select('is_active')
        .eq('id', id)
        .eq('user_id', targetId)
        .maybeSingle()
      await db.from('iptv_sources').delete().eq('id', id).eq('user_id', targetId)
      if (row?.is_active) {
        const { data: next } = await db
          .from('iptv_sources')
          .select('id')
          .eq('user_id', targetId)
          .order('created_at')
          .limit(1)
          .maybeSingle()
        if (next?.id) await setActive(targetId, next.id as string)
        else await store(targetId, '')
      }
      return json({ ok: true })
    }

    default:
      return json({ error: 'Unknown action' }, 400)
  }
})
