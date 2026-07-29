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
 * Safe preview shown in the UI — host plus a hint of the path, with every
 * credential redacted. e.g. `provider.tv/get.php?username=ab•••`
 */
export function maskPlaylistUrl(raw: string): string {
  const url = (raw ?? '').trim()
  if (!url) return ''
  try {
    const u = new URL(url)
    const user = u.searchParams.get('username') ?? ''
    const hint = user ? `?username=${user.slice(0, 2)}•••` : ''
    return `${u.host}${u.pathname}${hint}`
  } catch {
    return `${url.slice(0, 12)}•••`
  }
}
