import { useCallback, useEffect, useRef, useState } from "react";

export type SignalAction = "buy" | "sell" | "wait";

export interface SignalEntry {
  id: string;
  time: number; // ms epoch
  action: "buy" | "sell";
  confidence: number;
  entryPrice: number;
  result: "correct" | "wrong" | "pending";
  resultPrice?: number;
}

const LOCK_MS = 90_000; // lock "was it correct?" 90s after the signal
const COOLDOWN_MS = 5 * 60_000; // re-record same direction only after 5 min
const MAX = 40;

function loadEntries(key: string): SignalEntry[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * Auto-saving signal journal (localStorage, per market key).
 * - Records each new distinct signal (date, direction, confidence, entry price).
 * - Evaluates "was it correct?" against the live price and locks the result after 90s.
 */
export function useSignalJournal(
  storeKey: string,
  action: SignalAction,
  confidence: number,
  price: number,
) {
  const key = `pro_signals_${storeKey}`;
  const keyRef = useRef(key);
  const [entries, setEntries] = useState<SignalEntry[]>(() => loadEntries(key));

  // Reload when the market key changes.
  useEffect(() => {
    keyRef.current = key;
    setEntries(loadEntries(key));
  }, [key]);

  const save = useCallback((next: SignalEntry[]) => {
    try {
      localStorage.setItem(keyRef.current, JSON.stringify(next.slice(0, MAX)));
    } catch {
      /* ignore quota */
    }
  }, []);

  // Auto-record a new actionable signal.
  useEffect(() => {
    if (action !== "buy" && action !== "sell") return;
    if (!Number.isFinite(price) || price <= 0) return;
    setEntries((prev) => {
      const last = prev[0];
      const fresh = !last || last.action !== action || Date.now() - last.time > COOLDOWN_MS;
      if (!fresh) return prev;
      const entry: SignalEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        time: Date.now(),
        action,
        confidence,
        entryPrice: price,
        result: "pending",
      };
      const next = [entry, ...prev].slice(0, MAX);
      save(next);
      return next;
    });
  }, [action, confidence, price, save]);

  // Evaluate + lock pending signals against the live price.
  useEffect(() => {
    if (!Number.isFinite(price) || price <= 0) return;
    setEntries((prev) => {
      let changed = false;
      const next = prev.map((e) => {
        if (e.result !== "pending") return e;
        if (Date.now() - e.time < LOCK_MS) return e;
        const correct = e.action === "buy" ? price >= e.entryPrice : price <= e.entryPrice;
        changed = true;
        return { ...e, result: correct ? "correct" : "wrong", resultPrice: price } as SignalEntry;
      });
      if (changed) save(next);
      return changed ? next : prev;
    });
  }, [price, save]);

  const clear = useCallback(() => {
    setEntries([]);
    save([]);
  }, [save]);

  const decided = entries.filter((e) => e.result !== "pending");
  const correct = decided.filter((e) => e.result === "correct").length;
  const accuracy = decided.length ? Math.round((correct / decided.length) * 100) : 0;

  return { entries, recent: entries.slice(0, 5), accuracy, decidedCount: decided.length, clear };
}
