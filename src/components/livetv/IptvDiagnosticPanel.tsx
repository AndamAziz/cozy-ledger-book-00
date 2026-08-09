import { useState } from 'react';
import { ChevronDown, Copy, Check } from 'lucide-react';
import type { IptvDiagnostic } from '@/hooks/useIptvPlaylist';

const VERDICT_LABEL: Record<string, string> = {
  waf_block: 'Firewall / bot filter block (WAF)',
  credentials: 'Credentials / subscription rejected',
  rate_limited: 'Rate limited by provider',
  geo_block: 'Geo-block (server location)',
  unknown: 'Unclassified provider refusal',
};

/**
 * Shows the exact upstream refusal (status, reqId, verdict, response headers and
 * body snippet) so a WAF block can be told apart from a credentials problem.
 */
export function IptvDiagnosticPanel({
  diagnostic,
  reqId,
  className = '',
}: {
  diagnostic?: IptvDiagnostic | null;
  reqId?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!diagnostic && !reqId) return null;

  const label = diagnostic ? (VERDICT_LABEL[diagnostic.verdict] ?? diagnostic.verdict) : 'Provider request failed';

  const copy = async () => {
    await navigator.clipboard.writeText(JSON.stringify({ reqId, ...diagnostic }, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={`rounded-lg border border-border/60 bg-muted/20 text-left ${className}`} dir="ltr">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        {diagnostic && (
          <span className="rounded-md bg-destructive/15 px-2 py-0.5 font-mono text-[11px] font-bold text-destructive">
            {diagnostic.status} {diagnostic.statusText ?? ''}
          </span>
        )}
        <span className="text-[11px] font-semibold text-foreground">{label}</span>
        {reqId && (
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">reqId: {reqId}</span>
        )}
      </div>

      {diagnostic && (
        <p className="px-3 pb-2 text-[11px] leading-relaxed text-muted-foreground">{diagnostic.reason}</p>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 border-t border-border/50 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground transition hover:text-foreground"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        Technical details
      </button>

      {open && diagnostic && (
        <div className="space-y-2 border-t border-border/50 px-3 py-2">
          <Row label="Request URL" value={diagnostic.url} mono />
          {diagnostic.action && <Row label="API action" value={diagnostic.action} mono />}
          {diagnostic.message && <Row label="Message" value={diagnostic.message} />}
          {typeof diagnostic.attempt === 'number' && <Row label="Attempt" value={String(diagnostic.attempt)} />}
          {typeof diagnostic.durationMs === 'number' && (
            <Row label="Duration" value={`${diagnostic.durationMs} ms`} />
          )}
          {diagnostic.headers && Object.keys(diagnostic.headers).length > 0 && (
            <Row
              label="Response headers"
              mono
              value={Object.entries(diagnostic.headers)
                .map(([k, v]) => `${k}: ${v}`)
                .join('\n')}
            />
          )}
          {diagnostic.bodySnippet && <Row label="Response body" value={diagnostic.bodySnippet} mono />}
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-2 py-1 text-[11px] font-semibold text-muted-foreground transition hover:text-foreground"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied' : 'Copy diagnostic'}
          </button>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground/70">{label}</p>
      <p
        className={`mt-0.5 break-all whitespace-pre-wrap text-[11px] text-foreground/80 ${mono ? 'font-mono' : ''}`}
      >
        {value}
      </p>
    </div>
  );
}
