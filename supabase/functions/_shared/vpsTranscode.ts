/**
 * Signs short-lived tokens for the VPS-side live transcode backend
 * (`/live-relay/transcode.php`). The provider's resolved media URL is
 * AES-256-GCM encrypted with a secret only this edge function and the VPS
 * share (`VPS_TRANSCODE_KEY`), so the URL — and any credentials it may
 * embed — never appears in the browser in plaintext, and the VPS endpoint
 * refuses anything it cannot decrypt or that has expired.
 */
let keyPromise: Promise<CryptoKey> | null = null

function getKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    const secret = Deno.env.get('VPS_TRANSCODE_KEY')
    if (!secret) throw new Error('VPS_TRANSCODE_KEY is not configured')
    keyPromise = crypto.subtle
      .digest('SHA-256', new TextEncoder().encode(secret))
      .then((bits) =>
        crypto.subtle.importKey('raw', bits, { name: 'AES-GCM' }, false, ['encrypt']),
      )
  }
  return keyPromise
}

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))

/**
 * Build the full `/live-relay/transcode.php?token=...` URL for a resolved
 * provider media URL. Returns null (never throws) when the secret is not
 * configured, so callers can treat this as an optional enhancement.
 */
export async function signTranscodeUrl(
  targetUrl: string,
  opts?: { full?: boolean; ttlSec?: number },
): Promise<string | null> {
  try {
    const key = await getKey()
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const payload = JSON.stringify({
      url: targetUrl,
      exp: Math.floor(Date.now() / 1000) + (opts?.ttlSec ?? 90),
      full: Boolean(opts?.full),
    })
    const cipher = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(payload)),
    )
    const packed = new Uint8Array(iv.length + cipher.length)
    packed.set(iv, 0)
    packed.set(cipher, iv.length)
    const token = `v1:${toB64(packed)}`
    return `https://andam.uk/live-relay/transcode.php?token=${encodeURIComponent(token)}`
  } catch {
    return null
  }
}
