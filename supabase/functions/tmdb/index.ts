import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const TMDB_BASE = "https://api.themoviedb.org/3";

// Only these TMDB endpoints can be proxied. The {id} placeholder matches a
// single path segment (digits for tmdb ids, or an imdb id like tt0371746).
const ALLOWED_PATHS: RegExp[] = [
  /^discover\/(movie|tv)$/,
  /^(movie|tv)\/popular$/,
  /^(movie|tv)\/[0-9]+$/,
  /^tv\/[0-9]+\/aggregate_credits$/,
  /^(movie|tv)\/[0-9]+\/videos$/,
  /^find\/tt[0-9]+$/i,
  /^search\/multi$/,
  /^search\/person$/,
  /^person\/[0-9]+\/combined_credits$/,
  /^trending\/all\/(day|week)$/,
];

// Query params that callers are allowed to forward to TMDB. api_key is added
// server-side and can never be supplied by the client.
const ALLOWED_PARAMS = new Set([
  "language",
  "page",
  "include_adult",
  "sort_by",
  "with_genres",
  "vote_count.gte",
  "query",
  "external_source",
  "append_to_response",
]);

function isPathAllowed(path: string): boolean {
  return ALLOWED_PATHS.some((re) => re.test(path));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const TMDB_API_KEY = Deno.env.get("TMDB_API_KEY");
  if (!TMDB_API_KEY) {
    console.error("tmdb proxy: TMDB_API_KEY is not configured");
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const reqUrl = new URL(req.url);
    const path = (reqUrl.searchParams.get("path") || "")
      .replace(/^\/+|\/+$/g, "")
      .trim();

    if (!path || !isPathAllowed(path)) {
      return new Response(JSON.stringify({ error: "Path not allowed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build the upstream TMDB URL with only allow-listed params + server key.
    const upstream = new URL(`${TMDB_BASE}/${path}`);
    for (const [key, value] of reqUrl.searchParams.entries()) {
      if (key === "path") continue;
      if (ALLOWED_PARAMS.has(key)) upstream.searchParams.set(key, value);
    }
    upstream.searchParams.set("api_key", TMDB_API_KEY);

    const tmdbRes = await fetch(upstream.toString(), {
      headers: { Accept: "application/json" },
    });
    const data = await tmdbRes.json();

    return new Response(JSON.stringify(data), {
      status: tmdbRes.status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        // Allow browsers/CDN to cache catalog responses briefly.
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("tmdb proxy error:", msg);
    return new Response(JSON.stringify({ error: "Upstream error" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
