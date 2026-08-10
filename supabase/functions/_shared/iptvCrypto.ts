/**
 * AES-256-GCM encryption for per-user IPTV credentials.
 *
 * Provider playlist URLs embed the user's Xtream username/password, so they are
 * never stored in plaintext, never returned to the browser and never logged.
 * Only edge functions holding IPTV_ENC_KEY can decrypt them.
 */

let keyPromise: Promise<CryptoKey> | null = null

function getKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    const secret = Deno.env.get('IPTV_ENC_KEY')
    if (!secret) throw new Error('IPTV_ENC_KEY is not configured')
    keyPromise = crypto.subtle
      .digest('SHA-256', new TextEncoder().encode(secret))
      .then((bits) =>
        crypto.subtle.importKey('raw', bits, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']),
      )
  }
  return keyPromise
}

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const fromB64 = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0))

/** Returns `v1:<base64(iv|ciphertext)>`. */
export async function encryptSecret(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      await getKey(),
      new TextEncoder().encode(plain),
    ),
  )
  const packed = new Uint8Array(iv.length + cipher.length)
  packed.set(iv, 0)
  packed.set(cipher, iv.length)
  return `v1:${toB64(packed)}`
}

export async function decryptSecret(stored: string | null | undefined): Promise<string> {
  if (!stored) return ''
  if (!stored.startsWith('v1:')) return ''
  try {
    const packed = fromB64(stored.slice(3))
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: packed.slice(0, 12) },
      await getKey(),
      packed.slice(12),
    )
    return new TextDecoder().decode(plain)
  } catch {
    return ''
  }
}

/**
 * Safe preview shown in the UI — host plus the shape of the path, with every
 * credential redacted. Nothing usable is ever exposed:
 *  - `username` / `password` / `token` query values are replaced by `•••`
 *  - credential-looking path segments (Xtream `/live/user/pass/id.ts`) are `•••`
 * e.g. `provider.tv/get.php?username=ab•••`
 */
export function maskPlaylistUrl(raw: string): string {
  const url = (raw ?? '').trim()
  if (!url) return ''
  const SECRET_KEYS = /^(username|user|pass|password|pwd|token|auth|key|api_key|secret|sig)$/i
  try {
    const u = new URL(url)
    const user = u.searchParams.get('username') ?? u.searchParams.get('user') ?? ''
    const hint = user ? `?username=${user.slice(0, 2)}•••` : ''
    // Xtream stream paths carry the credentials as path segments.
    const segments = u.pathname.split('/')
    const safePath = segments
      .map((seg, i) => {
        if (!seg) return seg
        const prev = (segments[i - 1] ?? '').toLowerCase()
        const credentialSlot =
          (prev === 'live' || prev === 'movie' || prev === 'series') ||
          (i >= 2 && /^(live|movie|series)$/i.test(segments[i - 2] ?? ''))
        if (credentialSlot && !/\.(ts|m3u8|mp4|mkv|mpd)$/i.test(seg)) return '•••'
        return seg
      })
      .join('/')
    // Any leftover secret-ish query param is flattened out of the preview.
    for (const [k] of u.searchParams.entries()) {
      if (SECRET_KEYS.test(k) && k.toLowerCase() !== 'username' && k.toLowerCase() !== 'user') {
        u.searchParams.set(k, '•••')
      }
    }
    return `${u.host}${safePath}${hint}`
  } catch {
    return `${url.slice(0, 12)}•••`
  }
}

