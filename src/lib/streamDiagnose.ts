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
};


const DETAILS: Record<string, string> = {
  MAX_CONNECTIONS:
    'Your IPTV account allows one stream at a time and another device (or a stream you just closed) is still holding it. Wait ~30 seconds and press Retry.',
  RATE_LIMITED: 'The provider asked us to slow down. Wait a moment and press Retry.',
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
      // Playable after all — nothing to report.
      try {
        await res.body?.cancel();
      } catch {
        /* ignore */
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
