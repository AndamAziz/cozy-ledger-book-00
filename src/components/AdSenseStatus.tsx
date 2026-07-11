import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Loader2, ShieldAlert, RefreshCw } from 'lucide-react';

const ADSENSE_CLIENT = 'ca-pub-7720176525727623';
const ADSENSE_SRC = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';

type Status = 'checking' | 'ok' | 'blocked' | 'missing' | 'error';

interface Result {
  status: Status;
  scriptPresent: boolean;
  apiReady: boolean;
  client: string | null;
  detail: string;
}

function readScriptTag(): HTMLScriptElement | null {
  const scripts = Array.from(document.querySelectorAll('script[src]')) as HTMLScriptElement[];
  return scripts.find((s) => s.src.includes('adsbygoogle.js')) || null;
}

async function verify(): Promise<Result> {
  const tag = readScriptTag();
  const scriptPresent = !!tag;
  const client = tag ? new URL(tag.src).searchParams.get('client') : null;

  if (!scriptPresent) {
    return {
      status: 'missing',
      scriptPresent,
      apiReady: false,
      client,
      detail: 'AdSense script tag was not found in the page <head>.',
    };
  }

  // Give the async script a moment to register the global.
  const apiReady = await new Promise<boolean>((resolve) => {
    let tries = 0;
    const tick = () => {
      if (typeof (window as unknown as { adsbygoogle?: unknown }).adsbygoogle !== 'undefined') {
        resolve(true);
        return;
      }
      if (tries++ > 20) {
        resolve(false);
        return;
      }
      setTimeout(tick, 250);
    };
    tick();
  });

  // Confirm the resource is actually reachable (ad blockers / network fail it).
  let reachable = apiReady;
  if (!reachable) {
    try {
      await fetch(`${ADSENSE_SRC}?client=${ADSENSE_CLIENT}`, {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-store',
      });
      reachable = true;
    } catch {
      reachable = false;
    }
  }

  if (!apiReady && !reachable) {
    return {
      status: 'blocked',
      scriptPresent,
      apiReady,
      client,
      detail: 'Script tag is present but the AdSense library failed to load — likely blocked by an ad blocker, privacy extension, or network.',
    };
  }

  if (client !== ADSENSE_CLIENT) {
    return {
      status: 'error',
      scriptPresent,
      apiReady,
      client,
      detail: `Script loaded but the publisher ID does not match. Expected ${ADSENSE_CLIENT}, found ${client ?? 'none'}.`,
    };
  }

  return {
    status: apiReady ? 'ok' : 'error',
    scriptPresent,
    apiReady,
    client,
    detail: apiReady
      ? 'AdSense verification script is present and loaded successfully.'
      : 'Script resource is reachable but the AdSense library did not initialise. Google may still be reviewing verification.',
  };
}

const STYLES: Record<Status, { border: string; bg: string; text: string; label: string; Icon: typeof CheckCircle2 }> = {
  checking: { border: 'border-muted/40', bg: 'bg-muted/10', text: 'text-muted-foreground', label: 'Checking…', Icon: Loader2 },
  ok: { border: 'border-success/40', bg: 'bg-success/10', text: 'text-success', label: 'Verified', Icon: CheckCircle2 },
  blocked: { border: 'border-amber-500/40', bg: 'bg-amber-500/10', text: 'text-amber-500', label: 'Blocked', Icon: ShieldAlert },
  missing: { border: 'border-destructive/40', bg: 'bg-destructive/10', text: 'text-destructive', label: 'Not found', Icon: XCircle },
  error: { border: 'border-destructive/40', bg: 'bg-destructive/10', text: 'text-destructive', label: 'Error', Icon: XCircle },
};

export function AdSenseStatus() {
  const [result, setResult] = useState<Result | null>(null);
  const [checking, setChecking] = useState(true);

  const run = () => {
    setChecking(true);
    verify().then((r) => {
      setResult(r);
      setChecking(false);
    });
  };

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const status: Status = checking ? 'checking' : result?.status ?? 'error';
  const s = STYLES[status];
  const Icon = s.Icon;

  return (
    <div className={`rounded-xl border ${s.border} ${s.bg} p-3 sm:p-4 no-print`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${s.text} ${checking ? 'animate-spin' : ''}`} />
          <span className="text-sm font-semibold text-foreground">Google AdSense</span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.bg} ${s.text} border ${s.border}`}>
            {s.label}
          </span>
        </div>
        <button
          onClick={run}
          disabled={checking}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          aria-label="Re-check AdSense status"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
          Re-check
        </button>
      </div>

      {result && !checking && (
        <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
          <p className={s.text}>{result.detail}</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1">
            <span>Script tag: <span className="text-foreground">{result.scriptPresent ? 'present' : 'missing'}</span></span>
            <span>Library loaded: <span className="text-foreground">{result.apiReady ? 'yes' : 'no'}</span></span>
            <span className="col-span-2 truncate">Publisher ID: <span className="text-foreground">{result.client ?? '—'}</span></span>
          </div>
        </div>
      )}
    </div>
  );
}
