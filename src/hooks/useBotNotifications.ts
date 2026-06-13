import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface BotNotification {
  id: string;
  user_id: string;
  bot_id: string | null;
  type: string;
  title: string;
  message: string;
  pnl: number | null;
  read: boolean;
  created_at: string;
}

function fireBrowserNotification(n: BotNotification) {
  try {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "granted") {
      new Notification(n.title, { body: n.message, tag: n.id });
    }
  } catch {
    /* ignore */
  }
}

function showToast(n: BotNotification) {
  const opts = { description: n.message } as const;
  if (n.type === "trade_win" || (n.pnl != null && n.pnl >= 0 && n.type !== "auto_pause")) {
    toast.success(n.title, opts);
  } else if (n.type === "trade_loss" || n.type === "auto_pause") {
    toast.error(n.title, opts);
  } else {
    toast(n.title, opts);
  }
}

/**
 * Global trading-bot notifications: listens for new alerts (trade opened/closed,
 * auto-pause, daily summary) and surfaces them as toasts + browser notifications.
 * Also requests a daily summary once per day.
 */
export function useBotNotifications() {
  const [items, setItems] = useState<BotNotification[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const userIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    userIdRef.current = user.id;
    const { data } = await supabase
      .from("bot_notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    const rows = (data as BotNotification[]) ?? [];
    rows.forEach((r) => seen.current.add(r.id));
    setItems(rows);
  }, []);

  const markAllRead = useCallback(async () => {
    const ids = items.filter((i) => !i.read).map((i) => i.id);
    if (!ids.length) return;
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    await supabase.from("bot_notifications").update({ read: true }).in("id", ids);
  }, [items]);

  const clearAll = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) return;
    setItems([]);
    await supabase.from("bot_notifications").delete().eq("user_id", uid);
  }, []);

  // Trigger a once-per-day daily summary (idempotent server-side).
  const requestDailySummary = useCallback(async () => {
    const today = new Date().toDateString();
    const key = "bot_daily_summary_day";
    if (localStorage.getItem(key) === today) return;
    localStorage.setItem(key, today);
    try {
      await supabase.functions.invoke("bots-engine", { body: { action: "daily-summary" } });
    } catch {
      localStorage.removeItem(key);
    }
  }, []);

  useEffect(() => {
    // Ask for browser notification permission once.
    try {
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    } catch { /* ignore */ }

    load().then(() => requestDailySummary());

    const ch = supabase
      .channel("bot-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bot_notifications" },
        (payload) => {
          const n = payload.new as BotNotification;
          if (seen.current.has(n.id)) return;
          seen.current.add(n.id);
          setItems((prev) => [n, ...prev].slice(0, 50));
          showToast(n);
          fireBrowserNotification(n);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load, requestDailySummary]);

  const unread = items.filter((i) => !i.read).length;
  return { items, unread, markAllRead, clearAll, refresh: load };
}
