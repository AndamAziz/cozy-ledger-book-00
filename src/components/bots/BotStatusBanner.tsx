import { cn } from "@/lib/utils";

/**
 * Colored banner explaining WHY a bot is currently paused or stopped.
 * Driven by the `pause_reason` field the engine sets on the bots table.
 *
 *   🟡 Paused: Market too quiet
 *   🔴 Blocked: FOMC in 45min
 *   🔴 Stopped: Daily loss limit hit
 *   🟢 Stopped: Daily target reached!
 */
type Tone = "amber" | "red" | "green";

function describe(reason: string): { tone: Tone; emoji: string; text: string } {
  // News block carries the event title after a colon, e.g. "news_block:FOMC ..."
  if (reason.startsWith("news_block:")) {
    const ev = reason.slice("news_block:".length).trim();
    return { tone: "red", emoji: "🔴", text: `Blocked: high-impact news${ev ? ` — ${ev}` : ""}` };
  }
  switch (reason) {
    case "vol_low":
      return { tone: "amber", emoji: "🟡", text: "Paused: market too quiet (low volatility)" };
    case "loss_streak":
      return { tone: "amber", emoji: "🟡", text: "Paused: 3 losing trades in a row" };
    case "daily_loss":
      return { tone: "red", emoji: "🔴", text: "Stopped: daily loss limit hit" };
    case "daily_target":
      return { tone: "green", emoji: "🟢", text: "Stopped: daily target reached!" };
    default:
      return { tone: "amber", emoji: "🟡", text: "Paused" };
  }
}

const TONE_CLASSES: Record<Tone, string> = {
  amber: "border-warning/40 bg-warning/10 text-warning",
  red: "border-destructive/40 bg-destructive/10 text-destructive",
  green: "border-success/40 bg-success/10 text-success",
};

export function BotStatusBanner({ reason }: { reason: string | null | undefined }) {
  if (!reason) return null;
  const { tone, emoji, text } = describe(reason);
  return (
    <div
      className={cn(
        "mt-3 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold",
        TONE_CLASSES[tone],
      )}
    >
      <span className="text-base leading-none">{emoji}</span>
      <span>{text}</span>
    </div>
  );
}
