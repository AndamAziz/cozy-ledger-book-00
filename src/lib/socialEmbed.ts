// Converts social-media share URLs (copied from mobile or desktop) into their
// embeddable player URLs so the Sport Live iframe can actually play them.
// Supports YouTube (video / live / shorts / youtu.be), TikTok, Instagram
// (post / reel / tv), and Facebook (video / watch / share links).

export type SocialPlatform = 'youtube' | 'tiktok' | 'instagram' | 'facebook';

export interface SocialEmbed {
  platform: SocialPlatform;
  /** URL that can be dropped straight into an iframe src. */
  embedUrl: string;
}

function safeUrl(raw: string): URL | null {
  try {
    return new URL(raw.trim());
  } catch {
    return null;
  }
}

function stripWww(host: string): string {
  return host.replace(/^www\./, '').replace(/^m\./, '').toLowerCase();
}

// ---- YouTube -------------------------------------------------------------
function youtubeEmbed(u: URL): string | null {
  const host = stripWww(u.hostname);
  let id: string | null = null;

  if (host === 'youtu.be') {
    id = u.pathname.split('/').filter(Boolean)[0] ?? null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') {
      id = u.searchParams.get('v');
    } else {
      // /live/ID, /shorts/ID, /embed/ID, /v/ID
      const parts = u.pathname.split('/').filter(Boolean);
      if (['live', 'shorts', 'embed', 'v'].includes(parts[0])) {
        id = parts[1] ?? null;
      }
    }
  } else {
    return null;
  }

  if (!id) return null;
  const params = new URLSearchParams({ autoplay: '1', playsinline: '1', rel: '0' });
  const start = u.searchParams.get('t') ?? u.searchParams.get('start');
  if (start) params.set('start', String(parseInt(start, 10) || 0));
  return `https://www.youtube.com/embed/${id}?${params.toString()}`;
}

// ---- TikTok --------------------------------------------------------------
const TIKTOK_ID_RE = /^\d{6,25}$/;

/**
 * Extracts the numeric TikTok video ID from any supported URL/string format:
 *   - https://www.tiktok.com/@user/video/1234567890?_r=1&_t=...
 *   - https://m.tiktok.com/v/1234567890.html
 *   - https://www.tiktok.com/embed/1234567890
 *   - https://www.tiktok.com/embed/v2/1234567890
 *   - https://www.tiktok.com/player/v1/1234567890
 *   - a bare numeric ID: "1234567890"
 *
 * Returns null for short/share links (vm.tiktok.com, /t/…) — those must be
 * resolved server-side via needsRedirectResolution() first.
 */
export function normalizeTikTokVideoId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (TIKTOK_ID_RE.test(trimmed)) return trimmed;

  const u = safeUrl(trimmed);
  if (!u) return null;
  const host = stripWww(u.hostname);
  if (!host.endsWith('tiktok.com')) return null;
  const path = u.pathname;

  // Try, in order: /video/ID, /v/ID(.html), /embed[/v2]/ID, /player/v1/ID
  const patterns: RegExp[] = [
    /\/video\/(\d{6,25})/,
    /\/v\/(\d{6,25})(?:\.html?)?/,
    /\/(?:embed|player)\/(?:v[12]\/)?(\d{6,25})/,
  ];
  for (const re of patterns) {
    const m = path.match(re);
    if (m) return m[1];
  }
  return null;
}

function tiktokEmbed(u: URL): string | null {
  const host = stripWww(u.hostname);
  if (!host.endsWith('tiktok.com')) return null;
  const id = normalizeTikTokVideoId(u.toString());
  if (!id) return null;
  // TikTok's official iframe player (player/v1) is more reliable than the
  // legacy /embed/v2/ page which frequently shows a "video unavailable" screen
  // when embedded on third-party domains. player/v1 also supports autoplay.
  return `https://www.tiktok.com/player/v1/${id}?autoplay=1&music_info=1&description=1&closed_caption=1`;
}

// ---- Instagram -----------------------------------------------------------
function instagramEmbed(u: URL): string | null {
  const host = stripWww(u.hostname);
  if (!host.endsWith('instagram.com')) return null;
  const parts = u.pathname.split('/').filter(Boolean);
  const idx = parts.findIndex((p) => ['p', 'reel', 'reels', 'tv'].includes(p));
  if (idx === -1 || !parts[idx + 1]) return null;
  const kind = parts[idx] === 'reels' ? 'reel' : parts[idx];
  const code = parts[idx + 1];
  return `https://www.instagram.com/${kind}/${code}/embed`;
}

// ---- Facebook ------------------------------------------------------------
function facebookEmbed(u: URL): string | null {
  const host = stripWww(u.hostname);
  if (!(host.endsWith('facebook.com') || host === 'fb.watch' || host === 'fb.me')) return null;

  // Normalise to a clean www.facebook.com URL and drop tracking params so the
  // video plugin can resolve reels / videos reliably. Mobile (m.facebook.com)
  // and share links otherwise confuse the plugin.
  const clean = new URL(u.href);
  clean.hostname = 'www.facebook.com';
  clean.protocol = 'https:';
  const videoId = clean.searchParams.get('v');
  clean.search = videoId ? `?v=${videoId}` : '';
  clean.hash = '';

  const href = encodeURIComponent(clean.toString());
  // The video plugin also handles /watch, /reel, /videos and live videos.
  return `https://www.facebook.com/plugins/video.php?href=${href}&autoplay=1&show_text=false`;
}

/**
 * Short / share links (vm.tiktok.com, fb.watch, facebook.com/share/…) do NOT
 * contain the video id — they 30x-redirect to the real URL. The browser cannot
 * follow those cross-origin, so they must be resolved server-side first.
 */
export function needsRedirectResolution(raw: string): boolean {
  const u = safeUrl(raw);
  if (!u) return false;
  const host = stripWww(u.hostname);
  const path = u.pathname;

  // TikTok short links: vm.tiktok.com/XXXX, vt.tiktok.com/XXXX, tiktok.com/t/XXXX
  if (host === 'vm.tiktok.com' || host === 'vt.tiktok.com') return true;
  if (host.endsWith('tiktok.com') && /^\/t\//.test(path)) return true;

  // Facebook share / short links (no id in the URL).
  if (host === 'fb.watch' || host === 'fb.me') return true;
  if (host.endsWith('facebook.com') && /^\/share\//.test(path)) return true;

  return false;
}

/**
 * Returns the embeddable URL for a supported social link, or null if the URL is
 * not a recognised YouTube / TikTok / Instagram / Facebook link.
 */
export function toSocialEmbed(raw: string): SocialEmbed | null {
  // Bare TikTok numeric ID (e.g. pasted from a copied "video ID").
  const bareId = normalizeTikTokVideoId(raw);
  if (bareId && !safeUrl(raw)) {
    return {
      platform: 'tiktok',
      embedUrl: `https://www.tiktok.com/player/v1/${bareId}?autoplay=1&music_info=1&description=1&closed_caption=1`,
    };
  }

  const u = safeUrl(raw);
  if (!u) return null;

  const yt = youtubeEmbed(u);
  if (yt) return { platform: 'youtube', embedUrl: yt };

  const tt = tiktokEmbed(u);
  if (tt) return { platform: 'tiktok', embedUrl: tt };

  const ig = instagramEmbed(u);
  if (ig) return { platform: 'instagram', embedUrl: ig };

  const fb = facebookEmbed(u);
  if (fb) return { platform: 'facebook', embedUrl: fb };

  return null;
}
