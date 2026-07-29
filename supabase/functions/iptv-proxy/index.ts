import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const UA = 'VLC/3.0.20 LibVLC/3.0.20'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const reqUrl = new URL(req.url)
  const target = reqUrl.searchParams.get('u')
  if (!target) {
    return new Response(JSON.stringify({ error: 'Missing u parameter' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let upstream: URL
  try {
    upstream = new URL(target)
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid url' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (upstream.protocol !== 'http:' && upstream.protocol !== 'https:') {
    return new Response(JSON.stringify({ error: 'Unsupported protocol' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const base = `${reqUrl.origin}${reqUrl.pathname}`
  const proxied = (u: string) => `${base}?u=${encodeURIComponent(u)}`

  const headers: Record<string, string> = { 'User-Agent': UA, Referer: upstream.origin }
  const range = req.headers.get('range')
  if (range) headers['Range'] = range

  try {
    const res = await fetch(upstream.toString(), { headers, redirect: 'follow' })
    const ct = res.headers.get('content-type') ?? ''
    const isPlaylist =
      ct.includes('mpegurl') || upstream.pathname.endsWith('.m3u8') || upstream.pathname.endsWith('.m3u')

    if (isPlaylist) {
      const text = await res.text()
      const finalUrl = new URL(res.url || upstream.toString())
      const rewritten = text
        .split(/\r?\n/)
        .map((line) => {
          const t = line.trim()
          if (!t) return line
          if (t.startsWith('#')) {
            return t.replace(/URI="([^"]+)"/g, (_m, u) => `URI="${proxied(new URL(u, finalUrl).toString())}"`)
          }
          return proxied(new URL(t, finalUrl).toString())
        })
        .join('\n')

      return new Response(rewritten, {
        status: res.status,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'no-store',
        },
      })
    }

    const out = new Headers(corsHeaders)
    out.set('Content-Type', ct || 'video/mp2t')
    const len = res.headers.get('content-length')
    if (len) out.set('Content-Length', len)
    const cr = res.headers.get('content-range')
    if (cr) out.set('Content-Range', cr)
    out.set('Accept-Ranges', 'bytes')
    out.set('Cache-Control', 'no-store')

    return new Response(res.body, { status: res.status, headers: out })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
