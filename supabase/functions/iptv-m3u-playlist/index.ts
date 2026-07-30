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
      const name = line.split(",").slice(1).join(",").trim() || attrs["tvg-name"] || "Unknown";
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

    if (!isValidUrl(url)) return json({ error: "Invalid url" }, 400);

    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    const UAS = [
      "VLC/3.0.20 LibVLC/3.0.20",
      "Lavf/60.3.100",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    ];

    let res: Response | null = null;
    try {
      for (const ua of UAS) {
        res = await fetch(url, {
          signal: controller.signal,
          headers: { "User-Agent": ua, Accept: "*/*" },
        });
        if (res.ok) break;
        // consume body so the connection can be reused
        await res.text().catch(() => "");
      }
    } catch (e) {
      clearTimeout(timer);
      return json({
        ok: false,
        status: "offline",
        latency_ms: Date.now() - started,
        error: e instanceof Error ? e.message : "fetch failed",
      });
    }
    clearTimeout(timer);

    const latency = Date.now() - started;
    if (!res || !res.ok) {
      return json({ ok: false, status: "error", http_status: res?.status ?? 0, latency_ms: latency });
    }

    const text = await res.text();
    const channels = parseM3U(text);
    const looksLikeM3U = text.includes("#EXTM3U") || channels.length > 0;

    if (action === "test") {
      return json({
        ok: looksLikeM3U,
        status: looksLikeM3U ? "online" : "invalid",
        latency_ms: latency,
        channel_count: channels.length,
        http_status: res.status,
      });
    }

    if (!looksLikeM3U) return json({ ok: false, status: "invalid", latency_ms: latency }, 200);

    const groups = [...new Set(channels.map((c) => c.group))].sort();
    return json({
      ok: true,
      status: "online",
      latency_ms: latency,
      channel_count: channels.length,
      groups,
      channels: channels.slice(0, 4000),
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
