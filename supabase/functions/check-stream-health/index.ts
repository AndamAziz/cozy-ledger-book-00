import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// Per-request timeout for probing a stream URL. Keep this lenient because many
// stream/movie hosts are slow or bot-protected while still loading in the viewer.
const PROBE_TIMEOUT_MS = 12000;

type Status = 'live' | 'slow' | 'offline';

interface HealthResult {
  id: string;
  url: string;
  reachable: boolean;
  latency_ms: number | null;
  status: Status;
  auto_disabled: boolean;
  is_active: boolean;
}

function classify(reachable: boolean, latency: number | null): Status {
  if (!reachable || latency === null) return 'offline';
  if (latency < 1200) return 'live';
  return 'slow';
}

function isPlayableResponse(status: number): boolean {
  // 401/403/405/429 often mean the host blocks server-side probes, not that the
  // browser iframe/video cannot play. Treat those as reachable for admin testing.
  return (status >= 200 && status < 400) || [401, 403, 405, 429].includes(status);
}

async function probe(url: string): Promise<{ reachable: boolean; latency: number | null }> {
  const start = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,video/*,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Range': 'bytes=0-1',
    };
    // Try GET first with browser-like headers; some hosts reject HEAD probes.
    let res: Response;
    try {
      res = await fetch(url, { method: 'GET', headers, signal: controller.signal, redirect: 'follow' });
      if (res.status >= 500) {
        res = await fetch(url, { method: 'HEAD', headers, signal: controller.signal, redirect: 'follow' });
      }
    } catch (_getErr) {
      res = await fetch(url, { method: 'HEAD', headers, signal: controller.signal, redirect: 'follow' });
    }
    // Drain body to avoid resource leaks
    try { await res.text(); } catch (_) { /* ignore */ }
    const latency = Math.round(performance.now() - start);
    const reachable = isPlayableResponse(res.status);
    return { reachable, latency: reachable ? latency : null };
  } catch (_err) {
    return { reachable: false, latency: null };
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Single-URL test mode: probe one URL on demand (admin "Test this stream").
    // No DB writes — this is a stateless check so it never affects failover.
    if (req.method === 'POST') {
      let body: { url?: string } = {};
      try { body = await req.json(); } catch (_) { /* no body */ }
      if (body?.url && typeof body.url === 'string') {
        const { reachable, latency } = await probe(body.url);
        const status = classify(reachable, latency);
        return new Response(
          JSON.stringify({ results: [{ url: body.url, reachable, latency_ms: latency, status }] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
        );
      }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Read every server (including auto-disabled) so we can keep monitoring / re-enable logic works
    const { data: servers, error } = await supabase
      .from('stream_servers')
      .select('id, url, fail_count, is_active, auto_disabled')
      .order('priority', { ascending: true });

    if (error) throw error;

    const results: HealthResult[] = await Promise.all(
      (servers ?? []).map(async (srv) => {
        const { reachable, latency } = await probe(srv.url);
        const status = classify(reachable, latency);
        const failCount = status === 'offline' ? (srv.fail_count ?? 0) + 1 : 0;

        try {
          await supabase
            .from('stream_servers')
            .update({
              last_status: status,
              last_latency_ms: latency,
              fail_count: failCount,
            })
            .eq('id', srv.id);
        } catch (_updErr) {
          // Non-fatal: still report result to client
        }

        return {
          id: srv.id,
          url: srv.url,
          reachable,
          latency_ms: latency,
          status,
          auto_disabled: srv.auto_disabled,
          is_active: srv.is_active,
        };
      }),
    );

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err) {
    console.error('check-stream-health error:', err);
    // Never crash the client: return empty results with 200
    return new Response(
      JSON.stringify({ results: [], error: String((err as Error)?.message ?? err) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  }
});
