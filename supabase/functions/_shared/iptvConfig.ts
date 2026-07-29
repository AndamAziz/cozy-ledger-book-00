import { createClient } from 'npm:@supabase/supabase-js@2'

export const IPTV_SETTING_KEY = 'iptv_playlist_url'

const CACHE_TTL = 60 * 1000
let cached: { url: string; at: number } | null = null

/**
 * Resolve the active IPTV playlist URL.
 * Priority: admin-managed value in `app_settings` → the IPTV_PLAYLIST_URL secret.
 */
export async function getPlaylistUrl(): Promise<string> {
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.url

  const fallback = Deno.env.get('IPTV_PLAYLIST_URL') ?? ''
  let url = fallback

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    )
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', IPTV_SETTING_KEY)
      .maybeSingle()
    if (data?.value && typeof data.value === 'string' && data.value.trim()) {
      url = data.value.trim()
    }
  } catch (_e) {
    // Fall back to the secret when the settings lookup fails.
  }

  cached = { url, at: Date.now() }
  return url
}

/** Parse Xtream credentials out of an M3U playlist URL. */
export function parseXtream(raw: string) {
  const u = new URL(raw)
  return {
    host: u.host,
    protocol: u.protocol,
    username: u.searchParams.get('username') ?? '',
    password: u.searchParams.get('password') ?? '',
  }
}
