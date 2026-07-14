import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// Follows the 30x redirect chain of social share / short links (vm.tiktok.com,
// fb.watch, facebook.com/share/…) and returns the first URL that actually
// contains a playable video/reel id, before the chain bounces to a login page.
// Browsers cannot do this cross-origin, so it must run server-side.

const MAX_HOPS = 8;
const HOP_TIMEOUT_MS = 8000;

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

// A URL that already carries a real content id we can embed.
function isContentUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www\.|m\.)/, '').toLowerCase();
    const p = u.pathname;
    if (host.endsWith('tiktok.com')) return /\/video\/\d+/.test(p);
    if (host.endsWith('facebook.com')) {
      return /\/reel\/\d+/.test(p) || /\/videos\/\d+/.test(p) || p === '/watch' || u.searchParams.has('v');
    }
    if (host.endsWith('instagram.com')) return /\/(reel|reels|p|tv)\//.test(p);
    if (host.endsWith('youtube.com') || host === 'youtu.be') return true;
    return false;
  } catch {
    return false;
  }
}

// Dead-ends we must never treat as the resolved URL.
function isDeadEnd(url: string): boolean {
  return /login\.php|\/login\/|consent|cookie|checkpoint/i.test(url);
}

async function resolveUrl(startUrl: string): Promise<string> {
  let current = startUrl;
  let lastContent: string | null = isContentUrl(startUrl) ? startUrl : null;

  for (let i = 0; i < MAX_HOPS; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HOP_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': MOBILE_UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
    } catch (_err) {
      break;
    } finally {
      clearTimeout(timer);
    }

    // Not a redirect → this is the final page.
    if (res.status < 300 || res.status >= 400) {
      try { await res.text(); } catch (_) { /* drain */ }
      if (isContentUrl(current) && !isDeadEnd(current)) lastContent = current;
      break;
    }

    const location = res.headers.get('location');
    try { await res.body?.cancel(); } catch (_) { /* ignore */ }
    if (!location) break;

    const next = new URL(location, current).toString();
    if (isContentUrl(next) && !isDeadEnd(next)) {
      // Found a real content URL — stop before the chain hits login/consent.
      lastContent = next;
      break;
    }
    if (isDeadEnd(next)) break;
    current = next;
  }

  return lastContent ?? current ?? startUrl;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let body: { url?: string } = {};
    try { body = await req.json(); } catch (_) { /* no body */ }

    const raw = typeof body.url === 'string' ? body.url.trim() : '';
    if (!raw) {
      return new Response(JSON.stringify({ error: 'Missing url', url: null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }
    try { new URL(raw); } catch (_) {
      return new Response(JSON.stringify({ url: raw }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const resolved = await resolveUrl(raw);
    return new Response(JSON.stringify({ url: resolved }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err) {
    console.error('resolve-social-url error:', err);
    // Never break the player: echo the input back on failure.
    let fallback: string | null = null;
    try { fallback = (await req.clone().json())?.url ?? null; } catch (_) { /* ignore */ }
    return new Response(JSON.stringify({ url: fallback, error: String((err as Error)?.message ?? err) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});
