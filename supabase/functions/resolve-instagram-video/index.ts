import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// Fetches an Instagram reel/post/tv page and extracts the direct mp4 URL from
// og:video / og:video:secure_url meta tags (or embedded JSON) so the player can
// stream it inline via a native <video> element — Instagram's official iframe
// embed only shows a preview card and refuses inline playback.
//
// This works only for PUBLIC media. Private posts, age-gated content, and
// creator opt-outs return a login wall — we surface a `blocked: true` flag so
// the client can fall back to the standard embed preview.

const HOP_TIMEOUT_MS = 10000;

// Instagram serves richer HTML (with og:video mp4) to embed clients and mobile
// UAs. Desktop browsers get an SPA shell where the video URL is buried inside
// obfuscated JSON. Try the embed endpoint first, then the mobile page.
const UA_EMBED =
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
const UA_MOBILE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

interface InstagramMedia {
  videoUrl: string | null;
  poster: string | null;
  username: string | null;
  blocked: boolean;
}

// Parses <meta property="og:video" content="..."> (and its variants).
function readMeta(html: string, prop: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
    'i',
  );
  const alt = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
    'i',
  );
  return html.match(re)?.[1] ?? html.match(alt)?.[1] ?? null;
}

// og:video URLs come out HTML-escaped (&amp;) — restore the raw URL so <video>
// can play it. Instagram's CDN URLs contain long signed query strings.
function unescapeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#x2F;/g, '/')
    .replace(/&#47;/g, '/')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// Some responses hide the mp4 URL inside a JSON blob like:
//   "video_url":"https:\/\/scontent-...mp4?...","video_versions":[{"url":"..."}]
function findJsonVideo(html: string): string | null {
  // Prefer video_url over video_versions[0] as it's the canonical HD copy.
  const m1 = html.match(/"video_url"\s*:\s*"([^"]+\.mp4[^"]*)"/i);
  if (m1) return JSON.parse(`"${m1[1]}"`);
  const m2 = html.match(/"video_versions"\s*:\s*\[\s*{[^}]*?"url"\s*:\s*"([^"]+\.mp4[^"]*)"/i);
  if (m2) return JSON.parse(`"${m2[1]}"`);
  const m3 = html.match(/"contentUrl"\s*:\s*"([^"]+\.mp4[^"]*)"/i);
  if (m3) return JSON.parse(`"${m3[1]}"`);
  return null;
}

async function fetchHtml(url: string, ua: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HOP_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.slice(0, 800000);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Turns https://www.instagram.com/reel/CODE/  into the /embed variant so
// Instagram serves the plain HTML with og:video (skips the JS SPA shell).
function toEmbedUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (!/(^|\.)instagram\.com$/i.test(u.hostname)) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    const idx = parts.findIndex((p) => ['p', 'reel', 'reels', 'tv'].includes(p));
    if (idx === -1 || !parts[idx + 1]) return null;
    const kind = parts[idx] === 'reels' ? 'reel' : parts[idx];
    return `https://www.instagram.com/${kind}/${parts[idx + 1]}/embed/captioned/`;
  } catch {
    return null;
  }
}

function toCanonical(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (!/(^|\.)instagram\.com$/i.test(u.hostname)) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    const idx = parts.findIndex((p) => ['p', 'reel', 'reels', 'tv'].includes(p));
    if (idx === -1 || !parts[idx + 1]) return null;
    const kind = parts[idx] === 'reels' ? 'reel' : parts[idx];
    return `https://www.instagram.com/${kind}/${parts[idx + 1]}/`;
  } catch {
    return null;
  }
}

async function extract(url: string): Promise<InstagramMedia> {
  const out: InstagramMedia = {
    videoUrl: null,
    poster: null,
    username: null,
    blocked: false,
  };

  const embedUrl = toEmbedUrl(url);
  const canonUrl = toCanonical(url);

  // 1) Try Instagram's /embed page with the FB scraper UA — the fastest path
  //    and the one that serves og:video for public reels.
  if (embedUrl) {
    const html = await fetchHtml(embedUrl, UA_EMBED);
    if (html) {
      const og =
        readMeta(html, 'og:video:secure_url') ||
        readMeta(html, 'og:video:url') ||
        readMeta(html, 'og:video');
      if (og) out.videoUrl = unescapeHtml(og);
      const poster = readMeta(html, 'og:image');
      if (poster) out.poster = unescapeHtml(poster);
      const user = html.match(/"owner"[^}]*?"username"\s*:\s*"([^"]+)"/i)?.[1] ||
        html.match(/instagram\.com\/([A-Za-z0-9._]+)\/"/)?.[1] ||
        null;
      if (user) out.username = user;
      if (!out.videoUrl) {
        const j = findJsonVideo(html);
        if (j) out.videoUrl = j;
      }
    }
  }

  // 2) Fall back to the canonical page with a mobile UA if we still have no mp4.
  if (!out.videoUrl && canonUrl) {
    const html = await fetchHtml(canonUrl, UA_MOBILE);
    if (html) {
      const og =
        readMeta(html, 'og:video:secure_url') ||
        readMeta(html, 'og:video:url') ||
        readMeta(html, 'og:video');
      if (og) out.videoUrl = unescapeHtml(og);
      if (!out.poster) {
        const poster = readMeta(html, 'og:image');
        if (poster) out.poster = unescapeHtml(poster);
      }
      if (!out.videoUrl) {
        const j = findJsonVideo(html);
        if (j) out.videoUrl = j;
      }
      // Login walls redirect to /accounts/login/ or serve a title that includes "Login".
      if (!out.videoUrl && /accounts\/login|login • Instagram/i.test(html)) {
        out.blocked = true;
      }
    }
  }

  return out;
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
      return new Response(JSON.stringify({ error: 'Missing url' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const media = await extract(raw);
    return new Response(JSON.stringify(media), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        // Cache signed CDN URLs briefly — they expire after ~2 hours anyway.
        'Cache-Control': 'public, max-age=300',
      },
      status: 200,
    });
  } catch (err) {
    console.error('resolve-instagram-video error:', err);
    return new Response(
      JSON.stringify({
        videoUrl: null,
        poster: null,
        username: null,
        blocked: false,
        error: String((err as Error)?.message ?? err),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  }
});
