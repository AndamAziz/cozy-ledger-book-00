import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SELF = () =>
  `${(Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "")}/functions/v1/iptv-m3u-proxy`;

function isHttp(u: string) {
  try {
    const p = new URL(u);
    return p.protocol === "http:" || p.protocol === "https:";
  } catch {
    return false;
  }
}

function rewritePlaylist(body: string, base: string, self: string) {
  const abs = (raw: string) => {
    try {
      return `${self}?url=${encodeURIComponent(new URL(raw, base).toString())}`;
    } catch {
      return raw;
    }
  };
  return body
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith("#")) {
        return t.replace(/URI="([^"]+)"/g, (_m, u) => `URI="${abs(u)}"`);
      }
      return abs(t);
    })
    .join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const target = new URL(req.url).searchParams.get("url") || "";
  if (!isHttp(target) || target.length > 2048) {
    return new Response(JSON.stringify({ error: "Invalid url" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const range = req.headers.get("range");
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: {
        "User-Agent": "VLC/3.0.20 LibVLC/3.0.20",
        ...(range ? { Range: range } : {}),
      },
      redirect: "follow",
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "fetch failed" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const finalUrl = new URL(upstream.url);
  const ct = upstream.headers.get("content-type") || "";
  const isPlaylist =
    ct.includes("mpegurl") || /\.m3u8?(\?|$)/i.test(finalUrl.pathname + finalUrl.search);

  if (isPlaylist) {
    const text = await upstream.text();
    const rewritten = rewritePlaylist(text, upstream.url, SELF());
    return new Response(rewritten, {
      status: upstream.status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "no-store",
      },
    });
  }

  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", ct || "application/octet-stream");
  const cr = upstream.headers.get("content-range");
  if (cr) headers.set("Content-Range", cr);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "no-store");

  return new Response(upstream.body, { status: upstream.status, headers });
});
