import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Short-link domains that redirect to the real content URL. We follow the
// redirect server-side (browsers can't due to CORS) and cache the result.
const SHORT_HOSTS = ['vm.tiktok.com', 'vt.tiktok.com', 'fb.watch'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    let payload: { url?: unknown };
    try {
      payload = await req.json();
    } catch {
      return json({ error: 'invalid_body' }, 400);
    }

    const raw = typeof payload.url === 'string' ? payload.url.trim() : '';
    if (!raw) return json({ error: 'invalid_url' }, 400);

    let normalized = raw;
    if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;

    let host = '';
    try {
      host = new URL(normalized).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      return json({ error: 'invalid_url' }, 400);
    }

    // Not a short link → nothing to resolve, hand it back unchanged.
    if (!SHORT_HOSTS.includes(host)) {
      return json({ resolvedUrl: normalized, cached: false, wasShort: false });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase =
      supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey) : null;

    // 1) Cache lookup
    if (supabase) {
      const { data: cached } = await supabase
        .from('resolved_links')
        .select('resolved_url')
        .eq('short_url', normalized)
        .maybeSingle();
      if (cached?.resolved_url) {
        return json({ resolvedUrl: cached.resolved_url, cached: true, wasShort: true });
      }
    }

    // 2) Follow the redirect server-side
    let resolvedUrl = '';
    try {
      const resp = await fetch(normalized, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        },
      });
      resolvedUrl = resp.url || '';
      // Consume the body to avoid resource leaks.
      await resp.text().catch(() => undefined);
    } catch (e) {
      console.error('resolve-short-link fetch failed:', String(e));
      return json({ error: 'resolution_failed' }, 200);
    }

    if (!resolvedUrl || resolvedUrl === normalized) {
      return json({ error: 'resolution_failed' }, 200);
    }

    // 3) Cache the mapping (best-effort)
    if (supabase) {
      const { error: upsertErr } = await supabase
        .from('resolved_links')
        .upsert({ short_url: normalized, resolved_url: resolvedUrl }, { onConflict: 'short_url' });
      if (upsertErr) console.error('resolve-short-link cache upsert failed:', upsertErr.message);
    }

    return json({ resolvedUrl, cached: false, wasShort: true });
  } catch (e) {
    console.error('resolve-short-link error:', String(e));
    return json({ error: 'internal_error' }, 500);
  }
});
