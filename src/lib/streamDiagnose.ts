/**
 * Ask the stream proxy *why* a channel refused to play.
 *
 * The media element only ever reports a generic MEDIA_ERR, so a failed load was
 * always shown as "This channel is not responding" — even when the real cause
 * was the provider's single-connection limit (HTTP 458 → MAX_CONNECTIONS).
 * A single tiny ranged request re-asks the proxy, which answers with a JSON
 * error payload we can turn into an honest message.
 */

export type StreamDiagnosis = {
  code: string;
  title: string;
  detail: string;
  /** Slot/rate limits clear by themselves — retrying immediately makes it worse. */
  waitOnly: boolean;
};

const TITLES: Record<string, string> = {
  MAX_CONNECTIONS: 'All viewing slots are in use',
  RATE_LIMITED: 'Provider is throttling requests',
  GEO_BLOCKED: 'Provider blocked this region',
  AUTH_FAILED: 'Provider rejected the account',
  SUBSCRIPTION_EXPIRED: 'Subscription expired',
  NOT_FOUND: 'This channel is no longer on the provider',
  CHANNEL_OFFLINE: 'This title is not available on your provider',
  CODEC_UNSUPPORTED: 'This device cannot decode the video',
};


const DETAILS: Record<string, string> = {
  MAX_CONNECTIONS:
    'Your IPTV account allows one stream at a time and another device (or a stream you just closed) is still holding it. Wait ~30 seconds and press Retry.',
  RATE_LIMITED: 'The provider asked us to slow down. Wait a moment and press Retry.',
  CODEC_UNSUPPORTED:
    'The file is fine — this browser ships no decoder for it. Use the button below to open the same stream in a player that has one.',
};

/**
 * @returns a diagnosis when the proxy reports a specific provider-side problem,
 *          or `null` when the failure is not explained (keep the retry ladder).
 */
export async function diagnoseStream(src: string, timeoutMs = 12_000): Promise<StreamDiagnosis | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(src, {
      headers: { Range: 'bytes=0-1' },
      signal: ctrl.signal,
    });
    const contentType = res.headers.get('content-type') ?? '';
    // Playback URLs use `soft=1`: expected provider refusals are returned as a
    // JSON 200 so the browser/runtime overlay does not treat them as an
    // unhandled Edge Function failure. Decode that payload before the normal
    // successful-media fast path.
    if (contentType.includes('json')) {
      const text = await res.text();
      let code = '';
      let message = '';
      try {
        const json = JSON.parse(text) as { code?: string; error?: string; message?: string };
        code = json.code ?? '';
        message = json.message ?? json.error ?? '';
      } catch {
        return null;
      }
      if (!TITLES[code]) return null;
      return {
        code,
        title: TITLES[code],
        detail: DETAILS[code] ?? message ?? 'The provider refused this stream.',
        waitOnly: code === 'MAX_CONNECTIONS' || code === 'RATE_LIMITED',
      };
    }
    if (res.ok || res.status === 206) {
      // Bytes are flowing, so the provider is fine. A <video> element that
      // still decoded nothing means the browser has no decoder: HEVC video, or
      // ac3/eac3/dts audio. Neither raises an error event -- the element just
      // sits at HAVE_NOTHING -- so the proxy's codec verdict is the only
      // signal, and it is the reason the retry ladder must stop here.
      const codec = (res.headers.get('x-andam-codec') || '').toLowerCase();
      try {
        await res.body?.cancel();
      } catch {
        /* ignore */
      }
      // Dolby / DTS belongs here too. mpegts.js logs 'Failed to execute
      // addSourceBuffer ... audio/mp4;codecs=ac-3' straight to the console and
      // then stalls without raising its own ERROR event, so no handler in the
      // player ever learns why nothing played. The proxy's codec verdict is
      // the only signal left, and every remaining engine hits the same wall.
      if (/hevc|h265|hvc1|hev1|ac-?3|ec-?3|eac3|dts|mpeg|mp3/.test(codec)) {
        return {
          code: 'CODEC_UNSUPPORTED',
          title: TITLES.CODEC_UNSUPPORTED,
          detail: DETAILS.CODEC_UNSUPPORTED,
          waitOnly: false,
        };
      }
      return null;
    }
    const text = await res.text();
    let code = '';
    let message = '';
    try {
      const json = JSON.parse(text) as { code?: string; error?: string; message?: string };
      code = json.code ?? '';
      message = json.message ?? json.error ?? '';
    } catch {
      /* non-JSON body */
    }
    if (!code) {
      if (res.status === 458 || res.status === 407) code = 'MAX_CONNECTIONS';
      else if (res.status === 429) code = 'RATE_LIMITED';
      else return null;
    }
    if (!TITLES[code]) return null;
    return {
      code,
      title: TITLES[code],
      detail: DETAILS[code] ?? message ?? 'The provider refused this stream.',
      waitOnly: code === 'MAX_CONNECTIONS' || code === 'RATE_LIMITED',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
