// Pure, framework-free helpers for the "paste-and-play" social link player.
// Detects the platform from a pasted URL and builds an embeddable iframe URL.
// Short-link domains (vm.tiktok.com, vt.tiktok.com, fb.watch) must be resolved
// server-side first (via the resolve-short-link edge function) and the resolved
// URL fed back through parseSocialUrl().

export type SocialPlatform =
  | "youtube"
  | "tiktok"
  | "facebook"
  | "instagram"
  | "unknown";

export interface SocialEmbed {
  platform: SocialPlatform;
  /** Embeddable iframe src, or null when the link can't be embedded. */
  embedUrl: string | null;
  /** The original (or resolved) URL, normalized with a scheme. */
  originalUrl: string;
  /** Extracted video/post id when available. */
  videoId?: string;
}

/** Hosts that redirect to the real URL and must be resolved server-side. */
export const SHORT_LINK_HOSTS = ["vm.tiktok.com", "vt.tiktok.com", "fb.watch"];

/** Prefix a bare URL with https:// so `new URL()` can parse it. */
export function normalizeUrl(raw: string): string {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function hostOf(url: string): string {
  try {
    return new URL(normalizeUrl(url)).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** True when the URL is a known short-link domain needing redirect resolution. */
export function isShortLink(url: string): boolean {
  return SHORT_LINK_HOSTS.includes(hostOf(url));
}

// ---------------------------------------------------------------------------
// Per-platform parsing
// ---------------------------------------------------------------------------

function parseYouTube(u: URL): SocialEmbed | null {
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  let id = "";

  if (host === "youtu.be") {
    id = u.pathname.split("/").filter(Boolean)[0] || "";
  } else if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    if (u.pathname === "/watch") {
      id = u.searchParams.get("v") || "";
    } else {
      const parts = u.pathname.split("/").filter(Boolean);
      // /live/ID, /shorts/ID, /embed/ID, /v/ID
      if (["live", "shorts", "embed", "v"].includes(parts[0])) {
        id = parts[1] || "";
      }
    }
  } else {
    return null;
  }

  if (!id) return null;
  return {
    platform: "youtube",
    embedUrl: `https://www.youtube.com/embed/${id}`,
    originalUrl: u.toString(),
    videoId: id,
  };
}

function parseTikTok(u: URL): SocialEmbed | null {
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "tiktok.com" && host !== "m.tiktok.com") return null;
  // /@username/video/ID  or  /video/ID
  const match = u.pathname.match(/\/video\/(\d+)/);
  const id = match?.[1];
  if (!id) return null;
  return {
    platform: "tiktok",
    embedUrl: `https://www.tiktok.com/embed/v2/${id}`,
    originalUrl: u.toString(),
    videoId: id,
  };
}

function parseFacebook(u: URL): SocialEmbed | null {
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (!["facebook.com", "web.facebook.com", "m.facebook.com", "fb.com"].includes(host)) {
    return null;
  }

  let id = "";
  if (u.pathname.startsWith("/watch")) {
    id = u.searchParams.get("v") || "";
  } else {
    const vids = u.pathname.match(/\/videos\/(\d+)/);
    const reel = u.pathname.match(/\/reel\/(\d+)/);
    id = vids?.[1] || reel?.[1] || "";
  }

  // Build a clean canonical URL (no tracking params) to hand to plugins/video.php
  const clean = `https://www.facebook.com${u.pathname}${
    id && u.pathname.startsWith("/watch") ? `?v=${id}` : ""
  }`;
  if (!id && !u.pathname.match(/\/videos\//) && !u.pathname.match(/\/reel\//)) {
    return null;
  }
  const href = encodeURIComponent(clean);
  return {
    platform: "facebook",
    embedUrl: `https://www.facebook.com/plugins/video.php?href=${href}&show_text=false&width=560`,
    originalUrl: u.toString(),
    videoId: id || undefined,
  };
}

function parseInstagram(u: URL): SocialEmbed | null {
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "instagram.com" && host !== "m.instagram.com") return null;
  // /p/ID, /reel/ID, /tv/ID  (tracking params like ?igsh=... are ignored)
  const match = u.pathname.match(/\/(p|reel|tv)\/([^/]+)/);
  if (!match) return null;
  const type = match[1];
  const id = match[2];
  return {
    platform: "instagram",
    embedUrl: `https://www.instagram.com/${type}/${id}/embed`,
    originalUrl: u.toString(),
    videoId: id,
  };
}

/**
 * Parse any full-format social URL into an embeddable descriptor.
 * Returns platform "unknown" with embedUrl null when nothing matches — the
 * caller should then show the "Open link directly" fallback.
 */
export function parseSocialUrl(raw: string): SocialEmbed {
  const normalized = normalizeUrl(raw);
  let u: URL;
  try {
    u = new URL(normalized);
  } catch {
    return { platform: "unknown", embedUrl: null, originalUrl: normalized };
  }

  const parsed =
    parseYouTube(u) || parseTikTok(u) || parseFacebook(u) || parseInstagram(u);

  return (
    parsed || { platform: "unknown", embedUrl: null, originalUrl: u.toString() }
  );
}

// ---------------------------------------------------------------------------
// i18n for the player UI (5 languages)
// ---------------------------------------------------------------------------

export interface SocialI18n {
  title: string;
  desc: string;
  placeholder: string;
  play: string;
  resolving: string;
  openDirect: string;
  invalid: string;
  failed: string;
  clear: string;
}

export const SOCIAL_I18N: Record<string, SocialI18n> = {
  en: {
    title: "Paste & Play",
    desc: "Paste a YouTube, TikTok, Facebook or Instagram link",
    placeholder: "Paste video link here…",
    play: "Play",
    resolving: "Resolving link…",
    openDirect: "Open link directly",
    invalid: "Please paste a valid link",
    failed: "Couldn't load this video. It may be private or removed.",
    clear: "Clear",
  },
  ku: {
    title: "لکاندن و لێدان",
    desc: "لینکی یوتیوب، تیکتۆک، فەیسبووک یان ئینستاگرام بلکێنە",
    placeholder: "لینکی ڤیدیۆ لێرە بلکێنە…",
    play: "لێدان",
    resolving: "شیکردنەوەی لینک…",
    openDirect: "کردنەوەی لینک ڕاستەوخۆ",
    invalid: "تکایە لینکێکی دروست بلکێنە",
    failed: "نەتوانرا ئەم ڤیدیۆیە باربکرێت. لەوانەیە تایبەت یان سڕاوەتەوە.",
    clear: "سڕینەوە",
  },
  ar: {
    title: "الصق وشغّل",
    desc: "الصق رابط يوتيوب أو تيك توك أو فيسبوك أو إنستغرام",
    placeholder: "الصق رابط الفيديو هنا…",
    play: "تشغيل",
    resolving: "جارٍ تحليل الرابط…",
    openDirect: "فتح الرابط مباشرة",
    invalid: "الرجاء لصق رابط صالح",
    failed: "تعذّر تحميل هذا الفيديو. قد يكون خاصًا أو محذوفًا.",
    clear: "مسح",
  },
  fa: {
    title: "بچسبان و پخش کن",
    desc: "لینک یوتیوب، تیک‌تاک، فیسبوک یا اینستاگرام را بچسبانید",
    placeholder: "لینک ویدیو را اینجا بچسبانید…",
    play: "پخش",
    resolving: "در حال تحلیل لینک…",
    openDirect: "باز کردن مستقیم لینک",
    invalid: "لطفاً یک لینک معتبر بچسبانید",
    failed: "این ویدیو بارگذاری نشد. ممکن است خصوصی یا حذف شده باشد.",
    clear: "پاک کردن",
  },
  tr: {
    title: "Yapıştır ve Oynat",
    desc: "YouTube, TikTok, Facebook veya Instagram bağlantısı yapıştırın",
    placeholder: "Video bağlantısını buraya yapıştırın…",
    play: "Oynat",
    resolving: "Bağlantı çözümleniyor…",
    openDirect: "Bağlantıyı doğrudan aç",
    invalid: "Lütfen geçerli bir bağlantı yapıştırın",
    failed: "Bu video yüklenemedi. Gizli veya kaldırılmış olabilir.",
    clear: "Temizle",
  },
};

export function getSocialI18n(lang: string): SocialI18n {
  return SOCIAL_I18N[lang] || SOCIAL_I18N.en;
}
