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

  // ---------------------------------------------------------------------------
  // Multi-source grants (`user_source_access`): an account may be allowed to
  // browse several providers and switch between them; exactly one grant is the
  // selected ("default") one, and it is mirrored into the single-server vault
  // row so every playback function keeps working unchanged.
  // ---------------------------------------------------------------------------

  /** Mirrors one specific source row into the single-server vault row. */
  const syncSelected = async (userId: string, sourceId: string) => {
    const { data } = await db
      .from('iptv_sources')
      .select('name, playlist_enc, playlist_masked')
      .eq('id', sourceId)
      .maybeSingle()
    if (!data?.playlist_enc) return false
    await db.from('user_iptv_servers').upsert(
      {
        user_id: userId,
        playlist_url: '',
        playlist_enc: data.playlist_enc as string,
        playlist_masked: String(data.playlist_masked ?? ''),
        provider_name: (data.name as string | null) ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    return true
  }

  /** Grants a source to a user, optionally making it their selected source. */
  const grantSource = async (userId: string, sourceId: string, makeDefault: boolean) => {
    if (makeDefault) {
      await db
        .from('user_source_access')
        .update({ is_default: false })
        .eq('user_id', userId)
        .eq('is_default', true)
    }
    await db.from('user_source_access').upsert(
      {
        user_id: userId,
        source_id: sourceId,
        is_default: makeDefault,
        granted_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,source_id' },
    )
    if (makeDefault) await syncSelected(userId, sourceId)
  }

  /** All sources one account may browse (grants, plus own rows for the CEO). */
  const listGranted = async (userId: string) => {
    const { data: grants } = await db
      .from('user_source_access')
      .select('source_id, is_default, iptv_sources(id, name, kind, playlist_masked, health_status, health_message)')
      .eq('user_id', userId)
      .order('created_at')

    type Row = {
      source_id: string
      is_default: boolean
      iptv_sources: {
        id: string
        name: string
        kind: string
        playlist_masked: string
        health_status: string | null
        health_message: string | null
      } | null
    }
    const rows = ((grants ?? []) as unknown as Row[]).filter((r) => !!r.iptv_sources)
    const out = rows.map((r) => ({
      id: r.iptv_sources!.id,
      name: r.iptv_sources!.name,
      kind: r.iptv_sources!.kind,
      masked: r.iptv_sources!.playlist_masked ?? '',
      isDefault: !!r.is_default,
      health: r.iptv_sources!.health_status ?? null,
      healthMessage: r.iptv_sources!.health_message ?? null,
    }))

    // Sources the account owns directly (CEO pool) are always browsable.
    const { data: owned } = await db
      .from('iptv_sources')
      .select('id, name, kind, playlist_masked, is_active, health_status, health_message')
      .eq('user_id', userId)
      .order('created_at')
    for (const o of owned ?? []) {
      if (out.some((s) => s.id === o.id)) continue
      out.push({
        id: o.id as string,
        name: o.name as string,
        kind: o.kind as string,
        masked: String(o.playlist_masked ?? ''),
        isDefault: !out.some((s) => s.isDefault) && !!o.is_active,
        health: (o.health_status as string | null) ?? null,
        healthMessage: (o.health_message as string | null) ?? null,
      })
    }
    return out
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

    // ---- CEO: assign one of my servers to a specific user ------------
    case 'search_users': {
      if (!isCeo) return json({ error: 'Forbidden' }, 403)
      const q = String(body.query ?? '').trim().toLowerCase()
      if (q.length < 2) return json({ users: [] })
      const found: { id: string; email: string }[] = []
      for (let page = 1; page <= 5 && found.length < 20; page++) {
        const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
        if (error) break
        for (const u of data?.users ?? []) {
          const email = (u.email ?? '').toLowerCase()
          if (email.includes(q)) found.push({ id: u.id, email: u.email ?? '' })
          if (found.length >= 20) break
        }
        if ((data?.users ?? []).length < 200) break
      }
      return json({ users: found })
    }

    case 'assign_source': {
      if (!isCeo) return json({ error: 'Only the CEO can assign servers' }, 403)
      const id = String(body.id ?? '')
      const targetId = String(body.targetUserId ?? '')
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Invalid source' }, 400)
      if (!/^[0-9a-f-]{36}$/i.test(targetId)) return json({ error: 'Pick a user first' }, 400)

      const { data: src } = await db
        .from('iptv_sources')
        .select('name, kind, playlist_enc, playlist_masked, last_test')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!src?.playlist_enc) return json({ error: 'That source no longer exists' }, 404)

      const { data: targetUser } = await db.auth.admin.getUserById(targetId)
      if (!targetUser?.user) return json({ error: 'That user does not exist' }, 404)
      const targetEmail = targetUser.user.email ?? ''

      // One row per (user, masked url): replace instead of duplicating.
      const { data: existing } = await db
        .from('iptv_sources')
        .select('id')
        .eq('user_id', targetId)
        .eq('playlist_masked', String(src.playlist_masked ?? ''))
        .maybeSingle()

      let newId = existing?.id as string | undefined
      const payload = {
        name: String(src.name ?? 'Assigned source'),
        kind: String(src.kind ?? 'm3u'),
        playlist_enc: src.playlist_enc,
        playlist_masked: String(src.playlist_masked ?? ''),
        last_test: src.last_test ?? null,
        updated_at: new Date().toISOString(),
      }
      if (newId) {
        await db.from('iptv_sources').update(payload).eq('id', newId).eq('user_id', targetId)
      } else {
        const { data: ins, error } = await db
          .from('iptv_sources')
          .insert({ ...payload, user_id: targetId, created_by: user.id })
          .select('id')
          .single()
        if (error) return json({ error: 'Could not assign that source' }, 500)
        newId = ins.id as string
      }

      const ok = await setActive(targetId, newId!)
      if (!ok) return json({ error: 'Assigned but could not activate it' }, 500)
      // Grant it in the many-to-many table too: an account can hold several
      // providers and switch between them from the app.
      const { count: grantCount } = await db
        .from('user_source_access')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', targetId)
      await grantSource(targetId, newId!, !grantCount)
      return json({ ok: true, email: targetEmail, name: payload.name })

    }

    /** Everyone (except the CEO) currently holding a copy of one of my sources. */
    case 'assigned_users': {
      if (!isCeo) return json({ error: 'Forbidden' }, 403)
      const id = String(body.id ?? '')
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Invalid source' }, 400)
      const { data: src } = await db
        .from('iptv_sources')
        .select('playlist_masked')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!src) return json({ users: [] })
      const { data: rows } = await db
        .from('iptv_sources')
        .select('user_id, is_active')
        .eq('playlist_masked', String(src.playlist_masked ?? ''))
        .neq('user_id', user.id)
      const users = await Promise.all(
        (rows ?? []).map(async (r) => {
          const { data } = await db.auth.admin.getUserById(r.user_id as string)
          return {
            id: r.user_id as string,
            email: data?.user?.email ?? '',
            isActive: !!r.is_active,
          }
        }),
      )
      return json({ users })
    }

    /** Revokes a source from one user: deletes their copy and re-points playback. */
    case 'unassign_source': {
      if (!isCeo) return json({ error: 'Only the CEO can revoke servers' }, 403)
      const id = String(body.id ?? '')
      const targetId = String(body.targetUserId ?? '')
      if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(targetId)) {
        return json({ error: 'Invalid request' }, 400)
      }
      if (targetId === user.id) return json({ error: 'Use Delete for your own sources' }, 400)

      const { data: src } = await db
        .from('iptv_sources')
        .select('playlist_masked')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!src) return json({ error: 'That source no longer exists' }, 404)

      const { data: targetRow } = await db
        .from('iptv_sources')
        .select('id, is_active')
        .eq('user_id', targetId)
        .eq('playlist_masked', String(src.playlist_masked ?? ''))
        .maybeSingle()

      const { data: targetUser } = await db.auth.admin.getUserById(targetId)
      const email = targetUser?.user?.email ?? ''
      if (!targetRow) return json({ ok: true, email, alreadyRevoked: true })

      await db.from('iptv_sources').delete().eq('id', targetRow.id as string).eq('user_id', targetId)
      // Revoke the grant for both the user's copy and the CEO pool row (older
      // backfilled grants point at the pool row).
      await db
        .from('user_source_access')
        .delete()
        .eq('user_id', targetId)
        .in('source_id', [targetRow.id as string, id])

      if (targetRow.is_active) {
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
      // Keep a selected source when other grants remain.
      const remaining = await listGranted(targetId)
      if (remaining.length && !remaining.some((s) => s.isDefault)) {
        await grantSource(targetId, remaining[0].id, true)
      }
      return json({ ok: true, email })
    }

    /** Every source the caller (or an admin's target user) may browse. */
    case 'my_sources': {
      const targetId = ownerId()
      if (!targetId) return json({ error: 'Forbidden' }, 403)
      return json({ sources: await listGranted(targetId) })
    }

    /** Switch the selected source (immediately effective for playback). */
    case 'select_source': {
      const targetId = ownerId()
      if (!targetId) return json({ error: 'Forbidden' }, 403)
      const id = String(body.id ?? '')
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Invalid source' }, 400)
      const allowed = await listGranted(targetId)
      if (!allowed.some((s) => s.id === id)) return json({ error: 'That source is not available to you' }, 403)
      await grantSource(targetId, id, true)
      const owns = await db
        .from('iptv_sources')
        .select('id')
        .eq('id', id)
        .eq('user_id', targetId)
        .maybeSingle()
      if (owns.data?.id) await setActive(targetId, id)
      if (!(await syncSelected(targetId, id))) {
        return json({ error: 'That source has no stored credentials' }, 409)
      }
      return json({ ok: true, id, sources: await listGranted(targetId) })
    }


    /**
     * CEO directory: every account (other than the CEO) that currently holds
     * at least one provider link, with all of their sources.
     */
    case 'assigned_directory': {
      if (!isCeo) return json({ error: 'Forbidden' }, 403)
      const { data: rows } = await db
        .from('iptv_sources')
        .select('id, user_id, name, kind, playlist_masked, is_active, updated_at')
        .neq('user_id', user.id)
        .order('created_at')

      const emails = new Map<string, string>()
      for (let page = 1; page <= 10; page++) {
        const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
        if (error) break
        for (const u of data?.users ?? []) emails.set(u.id, u.email ?? '')
        if ((data?.users ?? []).length < 200) break
      }

      const byUser = new Map<
        string,
        { userId: string; email: string; sources: Record<string, unknown>[] }
      >()
      for (const r of rows ?? []) {
        const uid = r.user_id as string
        if (!byUser.has(uid)) {
          byUser.set(uid, { userId: uid, email: emails.get(uid) ?? '', sources: [] })
        }
        byUser.get(uid)!.sources.push({
          id: r.id,
          name: r.name,
          kind: r.kind,
          playlist_masked: r.playlist_masked,
          is_active: r.is_active,
          updated_at: r.updated_at,
        })
      }

      const users = [...byUser.values()].sort((a, b) => a.email.localeCompare(b.email))
      return json({ users })
    }


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
        .select(
          'id, name, kind, playlist_masked, is_active, last_test, health_status, health_message, health_checked_at, updated_at',
        )

        .eq('user_id', targetId)
        .order('created_at')
      return json({ sources: data ?? [] })
    }


    case 'save_source': {
      if (!isCeo) return json({ error: 'Only the CEO can add or change provider links' }, 403)
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
      // Keep the grant table's selection in step with the owner's active row.
      const granted = await db
        .from('user_source_access')
        .select('id')
        .eq('user_id', targetId)
        .eq('source_id', id)
        .maybeSingle()
      if (granted.data?.id) await grantSource(targetId, id, true)
      return ok ? json({ ok: true }) : json({ error: 'Could not switch source' }, 500)

    }

    case 'delete_source': {
      if (!isCeo) return json({ error: 'Only the CEO can delete provider links' }, 403)
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
