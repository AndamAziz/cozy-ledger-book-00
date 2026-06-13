import { useState } from "react";
import { Bell, Check, Trash2 } from "lucide-react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { useBotNotificationsContext } from "@/contexts/BotNotificationsContext";
import { cn } from "@/lib/utils";

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function NotificationBell() {
  const { items, unread, markAllRead, clearAll } = useBotNotificationsContext();
  const [open, setOpen] = useState(false);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => { setOpen(o); if (o && unread) markAllRead(); }}
    >
      <PopoverTrigger asChild>
        <button
          aria-label="Notifications"
          className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card hover:bg-secondary"
        >
          <Bell className="h-5 w-5 text-foreground" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-semibold text-foreground">Notifications</span>
          <div className="flex items-center gap-1">
            {items.some((i) => !i.read) && (
              <button onClick={() => markAllRead()} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary" aria-label="Mark all read">
                <Check className="h-4 w-4" />
              </button>
            )}
            {items.length > 0 && (
              <button onClick={() => clearAll()} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive" aria-label="Clear all">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-3 py-10 text-center text-sm text-muted-foreground">No notifications yet.</div>
          ) : (
            items.map((n) => {
              const positive = n.pnl != null && n.pnl >= 0;
              const negative = n.type === "trade_loss" || n.type === "auto_pause" || (n.pnl != null && n.pnl < 0);
              return (
                <div key={n.id} className={cn("border-b border-border/60 px-3 py-2.5", !n.read && "bg-secondary/40")}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{n.title}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</span>
                  </div>
                  <p className={cn(
                    "mt-0.5 text-xs",
                    positive ? "text-success" : negative ? "text-destructive" : "text-muted-foreground",
                  )}>
                    {n.message}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
