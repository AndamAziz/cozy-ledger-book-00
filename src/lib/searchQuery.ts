/**
 * Build the PLUSCHANNEL search URL for a movie/series title.
 *
 * Encoding rules (application/x-www-form-urlencoded, what mv.andam.uk expects):
 *  - Normalize unicode (NFC) and strip zero-width / bidi control chars, so
 *    Kurdish/Arabic titles don't carry invisible characters into the query.
 *  - Collapse every whitespace kind (tabs, newlines, NBSP, ideographic space)
 *    into single ASCII spaces, then encode spaces as "+".
 *  - Percent-encode everything else that is not [A-Za-z0-9-_.~], including the
 *    characters encodeURIComponent leaves alone (! ' ( ) *) and "+" itself,
 *    so a literal plus in a title never reads as a space.
 */
export function encodeSearchQuery(title: string): string {
  const cleaned = (title ?? "")
    .normalize("NFC")
    // zero-width + bidi/format controls
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, "")
    // any whitespace (incl. NBSP U+00A0, U+3000) -> plain space
    .replace(/[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+/g, " ")
    .trim();

  return cleaned
    .split(" ")
    .map((part) =>
      encodeURIComponent(part).replace(
        /[!'()*]/g,
        (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
      ),
    )
    .join("+");
}

/** Full PLUSCHANNEL URL for a given title. */
export function buildPlusChannelUrl(title: string): string {
  return `https://mv.andam.uk/search?q=${encodeSearchQuery(title)}`;
}
