import { createClient } from 'npm:@supabase/supabase-js@2'

/**
 * Per-user Live TV resolution.
 *
 * The provider forbids one shared playlist for the whole platform, so every
 * request must be resolved against the caller's OWN Xtream/M3U credentials and
 * their own Live TV entitlement (24h trial → paid activation).
 */

export type ViewerError = 'UNAUTHORIZED' | 'NO_ACCESS' | 'NO_SERVER'

export interface Viewer {
  userId: string
  email: string | null
  /** The caller's personal playlist URL. */
  playlistUrl: string
  isAdmin: boolean
  access: {
    trialEndsAt: string | null
    isActivated: boolean
    hasAccess: boolean
  }
}

export interface ViewerFailure {
  error: ViewerError
  message: string
  status: number
}

export type ViewerResult = { ok: true; viewer: Viewer } | { ok: false } & ViewerFailure

let _admin: ReturnType<typeof createClient> | null = null
export function serviceClient() {
  if (!_admin) {
    _admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    )
  }
  return _admin
}

/**
 * Extract the caller's access token.
 *
 * `<video src>` and HLS segment requests cannot carry headers, so the stream
 * proxy also accepts the token as a query parameter.
 */
export function tokenFromRequest(req: Request): string {
  const header = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  const url = new URL(req.url)
  const qs = (url.searchParams.get('token') ?? '').trim()
  // The anon publishable key is sent as a Bearer token by the JS client; it is
  // not a user token, so only treat a JWT with a `sub` claim as the viewer.
  const candidate = qs || header
  return candidate
}

const isUserJwt = (token: string) => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload?.sub === 'string' && payload.sub.length > 0 && payload.role !== 'anon'
  } catch {
    return false
  }
}

/** Small per-user cache so every HLS segment does not re-query the database. */
const CACHE_TTL = 30_000
const cache = new Map<string, { at: number; viewer: Viewer }>()

export function invalidateViewer(userId: string) {
  cache.delete(userId)
}

/**
 * Resolve the caller, their personal playlist URL and their Live TV entitlement.
 * Admins always keep access so they can verify a user's server.
 */
export async function resolveViewer(req: Request): Promise<ViewerResult> {
  const token = tokenFromRequest(req)
  if (!token || !isUserJwt(token)) {
    return { ok: false, error: 'UNAUTHORIZED', status: 401, message: 'Sign in to watch Live TV.' }
  }

  const supabase = serviceClient()
  const { data: userData } = await supabase.auth.getUser(token)
  const user = userData?.user
  if (!user) {
    return { ok: false, error: 'UNAUTHORIZED', status: 401, message: 'Your session has expired. Sign in again.' }
  }

  const hit = cache.get(user.id)
  if (hit && Date.now() - hit.at < CACHE_TTL) {
    return finalise(hit.viewer)
  }

  const [serverRes, accessRes, adminRes] = await Promise.all([
    supabase.from('user_iptv_servers').select('playlist_url').eq('user_id', user.id).maybeSingle(),
    supabase.from('livetv_access').select('trial_ends_at, is_activated').eq('user_id', user.id).maybeSingle(),
    supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' }),
  ])

  const trialEndsAt = (accessRes.data?.trial_ends_at as string | null) ?? null
  const isActivated = !!accessRes.data?.is_activated
  const isAdmin = !!adminRes.data
  const trialActive = !!trialEndsAt && new Date(trialEndsAt).getTime() > Date.now()

  const viewer: Viewer = {
    userId: user.id,
    email: user.email ?? null,
    playlistUrl: String(serverRes.data?.playlist_url ?? '').trim(),
    isAdmin,
    access: {
      trialEndsAt,
      isActivated,
      hasAccess: isAdmin || isActivated || trialActive,
    },
  }

  cache.set(user.id, { at: Date.now(), viewer })
  if (cache.size > 500) cache.delete(cache.keys().next().value as string)

  return finalise(viewer)
}

function finalise(viewer: Viewer): ViewerResult {
  if (!viewer.access.hasAccess) {
    return {
      ok: false,
      error: 'NO_ACCESS',
      status: 402,
      message: 'Your 24-hour Live TV trial has ended. Activate Live TV to continue watching.',
    }
  }
  if (!viewer.playlistUrl) {
    return {
      ok: false,
      error: 'NO_SERVER',
      status: 424,
      message: 'Add your personal IPTV playlist link in Live TV settings to start watching.',
    }
  }
  return { ok: true, viewer }
}
