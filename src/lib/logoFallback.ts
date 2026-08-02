import { useEffect, useMemo, useState } from 'react';

const EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

/**
 * Build the list of URLs to try for a channel logo.
 * Handles providers that advertise a .png that only exists as .jpg (and vice versa),
 * plus a protocol upgrade for http-only logo hosts.
 */
export function logoCandidates(logo: string | null | undefined): string[] {
  if (!logo) return [];
  const raw = logo.trim();
  if (!raw || raw.startsWith('data:')) return raw ? [raw] : [];

  const out: string[] = [raw];

  const qIndex = raw.search(/[?#]/);
  const base = qIndex === -1 ? raw : raw.slice(0, qIndex);
  const suffix = qIndex === -1 ? '' : raw.slice(qIndex);
  const dot = base.lastIndexOf('.');
  const ext = dot > base.lastIndexOf('/') ? base.slice(dot).toLowerCase() : '';

  if (EXTS.includes(ext)) {
    for (const alt of EXTS) {
      if (alt === ext) continue;
      out.push(`${base.slice(0, dot)}${alt}${suffix}`);
    }
  }

  // Some logo hosts only answer over https even when the playlist says http.
  if (raw.startsWith('http://')) out.push(...out.map((u) => u.replace(/^http:\/\//, 'https://')));

  return [...new Set(out)];
}

/**
 * Cycles through logo candidates on load error. When every candidate fails,
 * `failed` flips to true so callers can render a clean placeholder instead of
 * a broken-image icon.
 */
export function useLogoFallback(logo: string | null | undefined) {
  const candidates = useMemo(() => logoCandidates(logo), [logo]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [logo]);

  const failed = candidates.length === 0 || index >= candidates.length;

  return {
    src: failed ? null : candidates[index],
    failed,
    onError: () => setIndex((i) => i + 1),
  };
}
