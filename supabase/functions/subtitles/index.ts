import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const UA = "TemporaryUserAgent";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "search";

    // ---------- SEARCH ----------
    if (action === "search") {
      const imdb = (url.searchParams.get("imdb_id") || "").replace(/\D/g, "");
      const langsRaw = (url.searchParams.get("langs") || "").trim(); // e.g. "eng,ara,kur" or "all"
      if (!imdb) return json({ error: "imdb_id required" }, 400);

      const base = `https://rest.opensubtitles.org/search/imdbid-${imdb}`;
      // The legacy endpoint accepts only ONE language per request, so query each separately.
      const langList =
        !langsRaw || langsRaw.toLowerCase() === "all"
          ? [""]
          : langsRaw
              .split(",")
              .map((l) => l.trim())
              .filter(Boolean);

      const results = await Promise.all(
        langList.map(async (l) => {
          const api = l ? `${base}/sublanguageid-${encodeURIComponent(l)}` : base;
          try {
            const r = await fetch(api, {
              headers: { "User-Agent": UA, "X-User-Agent": UA },
            });
            if (!r.ok) return [];
            const d = await r.json().catch(() => []);
            return Array.isArray(d) ? d : [];
          } catch {
            return [];
          }
        }),
      );

      const list = results.flat();
      const subs = list
        .map((s: Record<string, string>) => ({
          id: s.IDSubtitleFile,
          lang: s.LanguageName,
          langId: s.SubLanguageID,
          iso: s.ISO639,
          name: s.SubFileName,
          format: s.SubFormat,
          rating: Number(s.SubRating) || 0,
          downloads: Number(s.SubDownloadsCnt) || 0,
          release: s.MovieReleaseName || "",
          hi: s.SubHearingImpaired === "1",
          url: s.SubDownloadLink,
        }))
        .filter((s) => s.url)
        .sort((a, b) => b.downloads - a.downloads)
        .slice(0, 100);

      return json({ subtitles: subs });
    }

    // ---------- DOWNLOAD ----------
    if (action === "download") {
      const link = url.searchParams.get("url") || "";
      const name = (url.searchParams.get("name") || "subtitle.srt").replace(
        /[^\w.\-]/g,
        "_",
      );
      if (!/^https:\/\/dl\.opensubtitles\.org\//.test(link)) {
        return json({ error: "invalid url" }, 400);
      }

      const r = await fetch(link, { headers: { "User-Agent": UA } });
      if (!r.ok || !r.body) {
        return json({ error: "download failed", status: r.status }, 502);
      }

      // OpenSubtitles serves a gzip-compressed subtitle file.
      const ds = new DecompressionStream("gzip");
      const buf = await new Response(r.body.pipeThrough(ds)).arrayBuffer();

      return new Response(buf, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/x-subrip; charset=utf-8",
          "Content-Disposition": `attachment; filename="${name}"`,
        },
      });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
