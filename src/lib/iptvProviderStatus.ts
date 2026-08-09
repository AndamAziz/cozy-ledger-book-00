import type { IptvDiagnostic } from '@/hooks/useIptvPlaylist';

/**
 * Small localStorage-backed log of provider reachability so the UI can always
 * answer "when did the catalogue last load?" and "what went wrong last?" —
 * even right after a reload, when react-query has no data yet.
 */
export interface IptvProviderStatus {
  /** ISO time of the last catalogue fetch that came back without a warning. */
  lastSuccessAt?: string;
  /** Channel/category total seen at that last successful fetch. */
  lastSuccessTotal?: number;
  /** ISO time of the last refused/degraded fetch. */
  lastFailureAt?: string;
  /** Verdict of the most recent refusal (waf_block, credentials, …). */
  lastVerdict?: string;
  /** Human-readable reason attached to that verdict. */
  lastReason?: string;
  /** HTTP status the provider answered with. */
  lastStatus?: number;
  /** Edge-function request id, useful when reporting the issue. */
  lastReqId?: string;
}

const KEY = 'iptv:provider-status:v1';

export function readProviderStatus(): IptvProviderStatus {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as IptvProviderStatus) : {};
  } catch {
    return {};
  }
}

function write(next: IptvProviderStatus) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage full or blocked — status display is non-critical */
  }
  window.dispatchEvent(new CustomEvent('iptv-provider-status'));
}

/** Record a catalogue fetch that returned a usable, non-degraded index. */
export function recordProviderSuccess(total: number, at?: string) {
  const prev = readProviderStatus();
  write({ ...prev, lastSuccessAt: at ?? new Date().toISOString(), lastSuccessTotal: total });
}

/** Record a refusal / degraded response together with its classified verdict. */
export function recordProviderFailure(diagnostic?: IptvDiagnostic | null, reqId?: string, fallbackReason?: string) {
  const prev = readProviderStatus();
  write({
    ...prev,
    lastFailureAt: new Date().toISOString(),
    lastVerdict: diagnostic?.verdict ?? 'unknown',
    lastReason: diagnostic?.reason ?? fallbackReason,
    lastStatus: diagnostic?.status,
    lastReqId: reqId,
  });
}

/** "3 min ago" style relative label; empty string when the time is unknown. */
export function relativeTime(iso?: string): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '';
  if (ms < 45_000) return 'just now';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}
