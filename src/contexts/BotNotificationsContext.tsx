import { createContext, useContext, ReactNode } from "react";
import { useBotNotifications, BotNotification } from "@/hooks/useBotNotifications";

interface Ctx {
  items: BotNotification[];
  unread: number;
  markAllRead: () => Promise<void>;
  clearAll: () => Promise<void>;
  refresh: () => Promise<void>;
}

const BotNotificationsContext = createContext<Ctx | null>(null);

export function BotNotificationsProvider({ children }: { children: ReactNode }) {
  const value = useBotNotifications();
  return (
    <BotNotificationsContext.Provider value={value}>
      {children}
    </BotNotificationsContext.Provider>
  );
}

export function useBotNotificationsContext(): Ctx {
  const ctx = useContext(BotNotificationsContext);
  if (!ctx) {
    return { items: [], unread: 0, markAllRead: async () => {}, clearAll: async () => {}, refresh: async () => {} };
  }
  return ctx;
}
