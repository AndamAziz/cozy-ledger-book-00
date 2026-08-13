import { useEffect, useState } from 'react';
import { Activity, ChevronDown, Download, RefreshCw } from 'lucide-react';
import {
  probeContentType,
  subscribeLiveDiag,
  getLiveDiag,
  type LiveDiag,
} from '@/lib/livePlaybackDiag';


const ENGINE_LABEL: Record<string, string> = {
  mpegts: 'mpegts.js (MPEG-TS)',
  hls: 'hls.js (HLS)',
  native: 'native <video>',
};

/**
 * Live diagnostics for the channel currently playing: which container candidate
 * the proxy was asked for, what content-type the provider really answered with,
 * and which engine in the fallback ladder is in use.
 */
export function LivePlaybackDiagnostics({ className = '' }: { className?: string }) {
  const [diag, setDiag] = useState<LiveDiag | null>(getLiveDiag);
  const [open, setOpen] = useState(false);
  const [ctype, setCtype] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);


  useEffect(() => subscribeLiveDiag(setDiag), []);

  const probe = async (src: string) => {
    setProbing(true);
    setCtype(await probeContentType(src));
    setProbing(false);
  };

  const buildReport = () => {
    if (!diag) return null;
    return {
      generatedAt: new Date().toISOString(),
      app: {
        url: window.location.href,
        userAgent: navigator.userAgent,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      },
      playback: {
        ...diag,
        observedContentType: ctype ?? diag.contentType ?? null,
      },
    };
  };

  const downloadReport = () => {
    const report = buildReport();
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `iptv-diag-${diag!.channelName.replace(/[^a-z0-9]/gi, '_').slice(0, 30)}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };


  // First open (and every engine/channel change while open) refreshes the
  // observed content-type.
  useEffect(() => {
    if (!open || !diag?.src) return;
    void probe(diag.src);
  }, [open, diag?.src, diag?.engine]);

  if (!diag) return null;

  return (
    <div className={`pointer-events-auto ${className}`} dir="ltr">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Playback diagnostics"
        className="flex items-center gap-1 rounded-full border border-white/20 bg-black/60 px-2 py-1 text-[10px] font-bold text-white/80 backdrop-blur transition hover:text-white"
      >
        <Activity className="h-3 w-3" />
        {diag.format.toUpperCase()} · {diag.engine}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-1 w-64 space-y-1 rounded-lg border border-white/15 bg-black/80 p-2 text-[10px] text-white/85 backdrop-blur">
          <Row label="Candidate format" value={diag.format} />
          <Row
            label="Content-Type"
            value={probing ? 'probing…' : (ctype ?? diag.contentType ?? 'unknown')}
          />
          <Row label="Engine selected" value={ENGINE_LABEL[diag.engine] ?? diag.engine} />
          <Row label="Fallback ladder" value={diag.ladder.join(' → ')} />
          <Row label="Route" value={diag.route} />
          <Row
            label="Panel formats"
            value={diag.formats.length ? diag.formats.join(', ') : 'not advertised'}
          />
          <Row label="TS-only panel" value={diag.tsOnly ? 'yes' : 'no'} />
          <Row label="Ladder stage" value={`${diag.stage + 1}/${diag.ladder.length} · try ${diag.attempt + 1}`} />
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => diag.src && void probe(diag.src)}
              className="flex items-center gap-1 rounded-md border border-white/20 px-2 py-0.5 font-bold text-white/80 transition hover:text-white"
            >
              <RefreshCw className={`h-3 w-3 ${probing ? 'animate-spin' : ''}`} /> Re-probe
            </button>
            <button
              type="button"
              onClick={copyJson}
              className="flex items-center gap-1 rounded-md border border-white/20 px-2 py-0.5 font-bold text-white/80 transition hover:text-white"
            >
              {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : 'Copy JSON'}
            </button>
            <button
              type="button"
              onClick={downloadReport}
              className="flex items-center gap-1 rounded-md border border-white/20 px-2 py-0.5 font-bold text-white/80 transition hover:text-white"
            >
              <Download className="h-3 w-3" /> Report
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="shrink-0 font-bold uppercase tracking-wide text-white/45">{label}</span>
      <span className="break-all text-end font-semibold">{value}</span>
    </div>
  );
}
