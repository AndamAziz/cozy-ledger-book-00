import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Plus, Trash2, ArrowUp, ArrowDown, Check } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { requestNotificationPermissionOnGesture } from '@/lib/notificationPermission';

interface PriceAlert {
  id: string;
  target: number;
  dir: "above" | "below";
  triggered: boolean;
}

interface Props {
  storeKey: string;
  label: string; // e.g. "XAU/USD"
  price: number;
  decimals: number;
}

function fireNotification(title: string, body: string) {
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body });
    }
  } catch {
    /* ignore */
  }
}

function loadAlerts(key: string): PriceAlert[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function PriceAlerts({ storeKey, label, price, decimals }: Props) {
  const { language } = useLanguage();
  const bi = (ku: string, en: string) => (language === "en" || language === "tr" ? en : ku);

  const key = `pro_alerts_${storeKey}`;
  const keyRef = useRef(key);
  const [alerts, setAlerts] = useState<PriceAlert[]>(() => loadAlerts(key));
  const [input, setInput] = useState("");

  const fmt = (n: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  useEffect(() => {
    keyRef.current = key;
    setAlerts(loadAlerts(key));
  }, [key]);

  // Deferred to the first user gesture — required by Firefox and Safari.
  useEffect(() => requestNotificationPermissionOnGesture(), []);

  const persist = useCallback((next: PriceAlert[]) => {
    setAlerts(next);
    try {
      localStorage.setItem(keyRef.current, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const add = () => {
    const t = parseFloat(input.replace(/,/g, ""));
    if (!Number.isFinite(t) || t <= 0) {
      toast.error(bi("نرخێکی دروست بنووسە", "Enter a valid price"));
      return;
    }
    const dir: "above" | "below" = price > 0 && t < price ? "below" : "above";
    const a: PriceAlert = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      target: t,
      dir,
      triggered: false,
    };
    persist([a, ...alerts]);
    setInput("");
    toast.success(
      bi("ئاگادارکردنەوەی نرخ زیادکرا", "Price alert set"),
      { description: `${label} ${dir === "above" ? "≥" : "≤"} ${fmt(t)}` } as { description: string },
    );
  };

  const remove = (id: string) => persist(alerts.filter((a) => a.id !== id));

  // Watch the live price and fire alerts on crossing.
  useEffect(() => {
    if (!Number.isFinite(price) || price <= 0) return;
    let changed = false;
    const next = alerts.map((a) => {
      if (a.triggered) return a;
      const hit = a.dir === "above" ? price >= a.target : price <= a.target;
      if (hit) {
        changed = true;
        const title = bi("🔔 ئاگاداری نرخ", "🔔 Price Alert");
        const body = `${label} ${bi("گەیشتە", "hit")} ${fmt(a.target)} · ${bi("ئێستا", "now")} ${fmt(price)}`;
        toast.success(title, { description: body } as { description: string });
        fireNotification(title, body);
        return { ...a, triggered: true };
      }
      return a;
    });
    if (changed) persist(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [price, alerts]);

  return (
    <div className="rounded-xl border border-white/10 bg-[#0d1117] p-3">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-[#f0b90b]" />
        <span className="text-sm font-bold text-white">{bi("ئاگادارکردنەوەی نرخ", "Price Alerts")}</span>
        <span className="ml-auto text-[10px] text-[#848e9c]">{bi("ئێستا", "Now")}: {price > 0 ? fmt(price) : "—"}</span>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <input
          inputMode="decimal"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder={bi("نرخی ئامانج", "Target price")}
          className="min-h-[44px] flex-1 rounded-lg border border-white/10 bg-[#0a0e17] px-3 text-sm text-white placeholder:text-[#5b6472] outline-none focus:border-[#f0b90b]/60 tabular-nums"
        />
        <button
          onClick={add}
          className="flex min-h-[44px] items-center gap-1 rounded-lg bg-[#f0b90b] px-3 text-sm font-bold text-[#0a0e17] active:scale-95 transition-transform"
        >
          <Plus className="h-4 w-4" /> {bi("زیادکردن", "Add")}
        </button>
      </div>

      {alerts.length === 0 ? (
        <p className="mt-2.5 text-center text-[11px] text-[#848e9c]">
          {bi("هیچ ئاگادارییەک دانەنراوە", "No alerts set yet")}
        </p>
      ) : (
        <ul className="mt-2.5 space-y-1.5">
          {alerts.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-[#0a0e17] px-2.5 py-2"
            >
              <div className="flex items-center gap-2">
                {a.dir === "above" ? (
                  <ArrowUp className="h-3.5 w-3.5 text-[#0ecb81]" />
                ) : (
                  <ArrowDown className="h-3.5 w-3.5 text-[#f6465d]" />
                )}
                <span className="text-sm font-bold text-white tabular-nums">{fmt(a.target)}</span>
                <span className="text-[10px] text-[#848e9c]">
                  {a.dir === "above" ? bi("سەرەوە", "Above") : bi("خوارەوە", "Below")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {a.triggered ? (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-[#0ecb81]">
                    <Check className="h-3 w-3" /> {bi("گەیشت", "Hit")}
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-[#f0b90b]">{bi("چالاک", "Active")}</span>
                )}
                <button
                  onClick={() => remove(a.id)}
                  aria-label={bi("سڕینەوە", "Delete")}
                  className="rounded-md p-1.5 text-[#848e9c] hover:bg-white/10 hover:text-[#f6465d] transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
