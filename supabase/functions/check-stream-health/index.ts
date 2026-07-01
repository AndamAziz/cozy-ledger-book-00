import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// Number of consecutive failed checks before a server is auto-disabled (~2.5 min at 30s cadence)
const AUTO_DISABLE_THRESHOLD = 5;
// Per-request timeout for probing a stream URL
const PROBE_TIMEOUT_MS = 3000;

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
  if (latency < 800) return 'live';
  if (latency <= 3000) return 'slow';
  return 'offline';
}

async function probe(url: string): Promise<{ reachable: boolean; latency: number | null }> {
  const start = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    // Try HEAD first; some servers reject HEAD, so fall back to GET.
    let res: Response;
    try {
      res = await fetch(url, { method: 'HEAD', signal: controller.signal, redirect: 'follow' });
      if (res.status >= 400) {
        res = await fetch(url, { method: 'GET', signal: controller.signal, redirect: 'follow' });
      }
    } catch (_headErr) {
      res = await fetch(url, { method: 'GET', signal: controller.signal, redirect: 'follow' });
    }
    // Drain body to avoid resource leaks
    try { await res.text(); } catch (_) { /* ignore */ }
    const latency = Math.round(performance.now() - start);
    const reachable = res.status >= 200 && res.status < 400;
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

        // Auto-disable only servers that are currently active and cross the threshold.
        const shouldAutoDisable =
          srv.is_active && failCount >= AUTO_DISABLE_THRESHOLD;
        const nextIsActive = shouldAutoDisable ? false : srv.is_active;
        const nextAutoDisabled = shouldAutoDisable ? true : srv.auto_disabled;

        try {
          await supabase
            .from('stream_servers')
            .update({
              last_status: status,
              last_latency_ms: latency,
              fail_count: failCount,
              is_active: nextIsActive,
              auto_disabled: nextAutoDisabled,
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
          auto_disabled: nextAutoDisabled,
          is_active: nextIsActive,
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
