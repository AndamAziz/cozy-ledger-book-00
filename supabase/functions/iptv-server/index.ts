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

  switch (action) {
    case 'get':
      return json(await readMasked(user.id))

    case 'save':
      return await store(user.id, String(body.playlistUrl ?? ''))

    case 'clear':
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

    case 'admin_save': {
      if (!isAdmin) return json({ error: 'Forbidden' }, 403)
      const targetId = String(body.userId ?? '')
      if (!/^[0-9a-f-]{36}$/i.test(targetId)) return json({ error: 'Invalid user' }, 400)
      return await store(targetId, String(body.playlistUrl ?? ''))
    }

    default:
      return json({ error: 'Unknown action' }, 400)
  }
})
