import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { playWinSound, playLoseSound, playDing } from "./useTradeSounds";
import { requestNotificationPermissionOnGesture } from '@/lib/notificationPermission';

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

// Notifications stay visible for 10 seconds (rule: keep notification 10s).
const TOAST_MS = 10_000;

function fireBrowserNotification(n: BotNotification) {
  try {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    // Surface even when the app is in the background / another tab.
    if (Notification.permission === "granted") {
      const nt = new Notification(n.title, { body: n.message, tag: n.id });
      // Auto-close after the same 10s window.
      window.setTimeout(() => { try { nt.close(); } catch { /* ignore */ } }, TOAST_MS);
    }
  } catch {
    /* ignore */
  }
}

// Notification types that represent a bot pause/stop (error/warning styling + ding).
const ERROR_TYPES = new Set(["trade_loss", "auto_pause", "bot_stopped_loss", "trade_emergency"]);
const WARNING_TYPES = new Set(["bot_paused", "news_close"]);
const SUCCESS_TYPES = new Set(["trade_win", "bot_stopped_target", "breakeven"]);

function showToast(n: BotNotification) {
  const opts = { description: n.message, duration: TOAST_MS } as const;
  if (SUCCESS_TYPES.has(n.type)) {
    toast.success(n.title, opts);
    if (n.type === "trade_win") playWinSound();
    else playDing();
  } else if (ERROR_TYPES.has(n.type)) {
    toast.error(n.title, opts);
    if (n.type === "trade_loss") playLoseSound();
    else playDing();
  } else if (WARNING_TYPES.has(n.type)) {
    toast.warning(n.title, opts);
    playDing();
  } else {
    toast(n.title, opts);
  }
}


// Persisted set of notification IDs we've already toasted, so a given alert
// (e.g. "trade opened") surfaces ONCE only — even after the user leaves the
// page and comes back, or fully reloads the app.
const SEEN_KEY = "bot_notif_seen_ids";
function loadSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function persistSeenIds(set: Set<string>) {
  try {
    // Keep the most recent 300 ids to bound storage.
    localStorage.setItem(SEEN_KEY, JSON.stringify([...set].slice(-300)));
  } catch {
    /* ignore */
  }
}

/**
 * Global trading-bot notifications: listens for new alerts (trade opened/closed,
 * auto-pause, daily summary) and surfaces them as toasts + browser notifications.
 * Also requests a daily summary once per day.
 */
export function useBotNotifications() {
  const [items, setItems] = useState<BotNotification[]>([]);
  const seen = useRef<Set<string>>(loadSeenIds());
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
    // Mark every already-existing alert as seen so re-entering the page never
    // re-toasts an old notification (BUG 1). Only brand-new INSERTs will toast.
    rows.forEach((r) => seen.current.add(r.id));
    persistSeenIds(seen.current);
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
    // Ask for browser notification permission on the first user gesture —
    // Firefox rejects load-time requests outright.
    const disarm = requestNotificationPermissionOnGesture();

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
          persistSeenIds(seen.current);
          setItems((prev) => [n, ...prev].slice(0, 50));
          showToast(n);
          fireBrowserNotification(n);
        },
      )
      .subscribe();
    return () => { disarm(); supabase.removeChannel(ch); };
  }, [load, requestDailySummary]);

  const unread = items.filter((i) => !i.read).length;
  return { items, unread, markAllRead, clearAll, refresh: load };
}
