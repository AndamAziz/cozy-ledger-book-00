import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { getPlaylistUrl, parseXtream } from '../_shared/iptvConfig.ts'

/** Temporary diagnostic: which upstream header/URL combination does the panel accept? */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const source = await getPlaylistUrl()
  if (!source) return new Response('no source', { status: 500, headers: corsHeaders })
  const { host, username, password } = parseXtream(source)
  const id = new URL(req.url).searchParams.get('id') ?? '68504'
  const cred = `http://${host}/live/${username}/${password}/${id}`

  const uas: Record<string, string> = {
    exo: 'IPTVSmartersPro/4.0.4 (Linux; Android 12) ExoPlayerLib/2.19.1',
    vlc: 'VLC/3.0.20 LibVLC/3.0.20',
    lavf: 'Lavf/58.76.100',
    okhttp: 'okhttp/4.9.3',
    none: '',
  }
  const urls: Record<string, string> = {
    m3u8: `${cred}.m3u8`,
    ts: `${cred}.ts`,
    bare: cred,
  }
  const variants: Record<string, (ua: string) => Record<string, string>> = {
    minimal: (ua) => (ua ? { 'User-Agent': ua } : {}),
    withOrigin: (ua) => ({
      'User-Agent': ua || 'x',
      Accept: '*/*',
      Origin: `http://${host}`,
      Referer: `http://${host}/`,
      'X-Requested-With': 'com.nathnetwork.xciptv',
      'Icy-MetaData': '1',
    }),
  }

  const out: Record<string, string> = {}
  for (const [un, u] of Object.entries(urls)) {
    for (const [vn, mk] of Object.entries(variants)) {
      for (const [uan, ua] of Object.entries(uas)) {
        if (vn === 'withOrigin') continue
        if (uan !== 'exo') continue
        const key = `${un}|${vn}|${uan}`
        try {
          const res = await fetch(u, {
            headers: mk(ua),
            redirect: 'follow',
            signal: AbortSignal.timeout(8000),
          })
          const ct = res.headers.get('content-type') ?? ''
          let peek = ''
          if (res.ok) {
            const t = await res.text().catch(() => '')
            peek = t.slice(0, 80).replace(/\s+/g, ' ')
          } else {
            const t = await res.text().catch(() => '')
            peek = t.slice(0, 300).replace(/\s+/g, ' ')
          }
          const hdrs = JSON.stringify(Object.fromEntries(res.headers.entries()))
          out[key] = `${res.status} ${ct} ${peek} :: ${hdrs}`
        } catch (e) {
          out[key] = `ERR ${e instanceof Error ? e.message : String(e)}`
        }
      }
    }
  }

  return new Response(JSON.stringify(out, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
