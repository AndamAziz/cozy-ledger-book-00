import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface Channel {
  name: string;
  logo: string | null;
  group: string;
  url: string;
  country: string | null;
}

function parseM3U(text: string): Channel[] {
  const lines = text.split(/\r?\n/);
  const channels: Channel[] = [];
  let pending: Omit<Channel, "url"> | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#EXTINF")) {
      const attrs: Record<string, string> = {};
      for (const m of line.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) attrs[m[1]] = m[2];
      // The display name is everything after the LAST comma that follows the attributes.
      const comma = line.indexOf(",", line.lastIndexOf('"') + 1);
      const name = (comma >= 0 ? line.slice(comma + 1).trim() : "") || attrs["tvg-name"] || "Unknown";
      pending = {
        name,
        logo: attrs["tvg-logo"] || null,
        group: attrs["group-title"] || "General",
        country: attrs["tvg-country"] || null,
      };
    } else if (!line.startsWith("#") && pending) {
      channels.push({ ...pending, url: line });
      pending = null;
    }
  }
  return channels;
}

function isValidUrl(u: unknown): u is string {
  if (typeof u !== "string" || u.length > 2048) return false;
  try {
    const p = new URL(u);
    return p.protocol === "http:" || p.protocol === "https:";
  } catch {
    return false;
  }
}

const UAS = [
  "VLC/3.0.20 LibVLC/3.0.20",
  "Lavf/60.3.100",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
];

/** Parsed-playlist cache so paged requests don't re-download a 40k-line M3U each time. */
const CACHE_TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; channels: Channel[]; latency: number }>();

async function download(url: string): Promise<{ text: string; status: number; latency: number }> {
  const started = Date.now();
  let last: Response | null = null;
  for (const ua of UAS) {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(60_000),
      headers: { "User-Agent": ua, Accept: "*/*", "Accept-Encoding": "identity" },
    });
    if (res.ok) {
      const text = await res.text();
      return { text, status: res.status, latency: Date.now() - started };
    }
    await res.text().catch(() => "");
    last = res;
  }
  return { text: "", status: last?.status ?? 0, latency: Date.now() - started };
}

/** Full playlist, retrying when a transfer is cut short mid-list. */
async function fetchChannels(url: string, force: boolean) {
  const hit = cache.get(url);
  if (!force && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit;

  let best: Channel[] = [];
  let latency = 0;
  let status = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    const { text, status: st, latency: ms } = await download(url);
    status = st;
    latency = ms;
    if (!text) continue;
    const parsed = parseM3U(text);
    if (parsed.length > best.length) best = parsed;
    // A complete transfer ends on a newline after the last stream URL.
    if (parsed.length && /\n\s*$/.test(text)) break;
  }
  if (!best.length) return { at: Date.now(), channels: [], latency, status };
  const entry = { at: Date.now(), channels: best, latency };
  cache.set(url, entry);
  return entry;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action === "test" ? "test" : "load";
    const url = body?.url;
    const offset = Math.max(0, Number(body?.offset) || 0);
    const limit = Math.min(6000, Math.max(200, Number(body?.limit) || 4000));
    const force = body?.refresh === true || body?.refresh === 1;

    if (!isValidUrl(url)) return json({ error: "Invalid url" }, 400);

    let result;
    try {
      result = await fetchChannels(url, force || action === "test");
    } catch (e) {
      return json({
        ok: false,
        status: "offline",
        latency_ms: 0,
        error: e instanceof Error ? e.message : "fetch failed",
      });
    }

    const all = result.channels;
    const latency = result.latency;

    if (action === "test") {
      return json({
        ok: all.length > 0,
        status: all.length > 0 ? "online" : "invalid",
        latency_ms: latency,
        channel_count: all.length,
      });
    }

    if (!all.length) return json({ ok: false, status: "invalid", latency_ms: latency });

    const page = all.slice(offset, offset + limit);
    const groups = offset === 0 ? [...new Set(all.map((c) => c.group))].sort() : undefined;

    return json({
      ok: true,
      status: "online",
      latency_ms: latency,
      channel_count: all.length,
      total: all.length,
      offset,
      limit,
      has_more: offset + page.length < all.length,
      groups,
      channels: page,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
