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
function tiktokEmbed(u: URL): string | null {
  const host = stripWww(u.hostname);
  if (!host.endsWith('tiktok.com')) return null;
  // Desktop / mobile: /@user/video/ID  ·  short link vm.tiktok.com/XXXX (no id)
  const match = u.pathname.match(/\/video\/(\d+)/);
  if (match) return `https://www.tiktok.com/embed/v2/${match[1]}`;
  // /embed/ID already
  const embedMatch = u.pathname.match(/\/embed\/(?:v2\/)?(\d+)/);
  if (embedMatch) return `https://www.tiktok.com/embed/v2/${embedMatch[1]}`;
  return null;
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
