import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface MonitorLog {
  id: string;
  level: string;
  message: string;
  created_at: string;
}

/**
 * Live, auto-updating feed of the bot's monitoring checks for the currently
 * open trade. New "Monitoring..." lines (logged ~every 5s by the engine) stream
 * in via realtime; this panel highlights them with a live pulse, a rolling
 * "last updated" timestamp, and auto-scroll to the newest check.
 */
/** Pull the latest price from a log line ("→ $X" preferred, else first "$X"). */
function extractLoggedPrice(message: string): number | null {
  const arrow = message.match(/→\s*\$([\d,]+\.\d+)/);
  const m = arrow ?? message.match(/\$([\d,]+\.\d+)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function LiveMonitorFeed({ logs, active }: { logs: MonitorLog[]; active: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [tickN, setTick] = useState(0);

  // Keep the relative "last updated" label fresh.
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  // Only the live-monitoring heartbeat lines, oldest → newest for a feed feel.
  const monitorLogs = useMemo(() => {
    const filtered = logs.filter(
      (l) => l.level === "advice" || /monitoring\.\.\./i.test(l.message),
    );
    return [...filtered].reverse();
  }, [logs]);

  const latest = monitorLogs[monitorLogs.length - 1];

  // Detect a stale price feed: if the most recent price hasn't changed across
  // the last checks for >30s, surface a warning.
  const stale = useMemo(() => {
    const pts = monitorLogs
      .map((l) => ({ price: extractLoggedPrice(l.message), t: new Date(l.created_at).getTime() }))
      .filter((p): p is { price: number; t: number } => p.price != null);
    if (pts.length < 2) return false;
    const current = pts[pts.length - 1];
    let firstSamePriceTime = current.t;
    for (let i = pts.length - 1; i >= 0; i--) {
      if (pts[i].price === current.price) firstSamePriceTime = pts[i].t;
      else break;
    }
    return Date.now() - firstSamePriceTime > 30_000;
    // tickN keeps this re-evaluating every second.
  }, [monitorLogs, tickN]);

  // Auto-scroll to the newest entry whenever the feed grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [monitorLogs.length]);

  if (!active) return null;

  const lastUpdated = latest ? new Date(latest.created_at).getTime() : null;
  const agoSec = lastUpdated != null ? Math.max(0, Math.floor((Date.now() - lastUpdated) / 1000)) : null;
  const agoLabel = agoSec == null ? "—" : agoSec < 60 ? `${agoSec}s ago` : `${Math.floor(agoSec / 60)}m ${agoSec % 60}s ago`;

  return (
    <div className="mt-3 rounded-2xl border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
          </span>
          Live Monitor
        </span>
        <span className="text-xs text-muted-foreground">Updated {agoLabel}</span>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">Checking the open trade every 5 seconds</div>
      {stale && (
        <div
          dir="ltr"
          className="mt-2 rounded-lg border border-warning/40 bg-warning/10 px-2 py-1 text-left text-[11px] font-medium text-warning"
        >
          ⚠️ Price feed may be stale
        </div>
      )}
      <div
        ref={scrollRef}
        dir="ltr"
        className="mt-2 max-h-56 space-y-1 overflow-y-auto scroll-smooth text-left font-mono text-[11px] leading-relaxed"
      >
        {monitorLogs.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground">Waiting for the next check…</div>
        ) : (
          monitorLogs.map((l, i) => {
            const isLatest = i === monitorLogs.length - 1;
            const closing = /closing/i.test(l.message);
            return (
              <div
                key={l.id}
                className={cn(
                  "rounded px-1.5 py-0.5 text-left transition-colors",
                  closing ? "text-gold" : "text-muted-foreground",
                  isLatest && "animate-fade-in bg-muted/40 text-foreground",
                )}
              >
                {l.message}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
