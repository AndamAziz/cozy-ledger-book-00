import { useState, ComponentType } from 'react';
import {
  Newspaper, CandlestickChart, Coins, Brain, Menu, Home,
  Bitcoin, DollarSign, Scale, Bot, ArrowRightLeft, X, UserPlus,
} from 'lucide-react';
import { TelegramIcon } from '@/components/TelegramIcon';
import { InviteFriendsModal } from '@/components/InviteFriendsModal';
import { TELEGRAM_BLUE, openTelegramChannel } from '@/lib/telegram';
import { useTelegramSubscribers, formatSubs } from '@/hooks/useTelegramSubscribers';

export type TrackerTab = 'crypto' | 'forex' | 'metals' | 'ai';

interface BottomNavProps {
  activeTab: TrackerTab;
  onTab: (tab: TrackerTab) => void;
  onHome: () => void;
  onNews: () => void;
  onVerify: () => void;
  onBot: () => void;
  onConvert: () => void;
  bi: (ku: string, en: string) => string;
}

const haptic = () => {
  try { navigator.vibrate?.(12); } catch { /* noop */ }
};

interface MainItem {
  key: string;
  icon: ComponentType<{ className?: string; size?: string | number; style?: React.CSSProperties }>;
  label: string;
  active: boolean;
  onPress: () => void;
  isExternal?: boolean;
}

export function BottomNav({ activeTab, onTab, onHome, onNews, onVerify, onBot, onConvert, bi }: BottomNavProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [tapped, setTapped] = useState<string | null>(null);
  const subs = useTelegramSubscribers();

  const press = (key: string, fn: () => void) => {
    haptic();
    setTapped(key);
    fn();
  };

  const mainItems: MainItem[] = [
    { key: 'home', icon: Home, label: bi('ماڵەوە', 'Home'), active: false, onPress: onHome },
    { key: 'telegram', icon: TelegramIcon, label: bi('چەنال', 'Channel'), active: false, onPress: openTelegramChannel, isExternal: true },
    { key: 'bot', icon: Bot, label: bi('بۆت', 'Bot'), active: false, onPress: onBot },
    { key: 'charts', icon: CandlestickChart, label: bi('چارت', 'Charts'), active: activeTab === 'crypto', onPress: () => onTab('crypto') },
    { key: 'gold', icon: Coins, label: bi('زێڕ', 'Gold'), active: activeTab === 'metals', onPress: () => onTab('metals') },
    { key: 'ai', icon: Brain, label: bi('شیکاری', 'AI'), active: activeTab === 'ai', onPress: () => onTab('ai') },
    { key: 'more', icon: Menu, label: bi('زیاتر', 'More'), active: activeTab === 'forex' || moreOpen, onPress: () => setMoreOpen(true) },
  ];

  const moreItems = [
    { key: 'bitcoin', icon: Bitcoin, label: bi('بیتکۆین', 'Bitcoin'), color: '#f0b90b', onPress: () => onTab('crypto') },
    { key: 'forex', icon: DollarSign, label: bi('دراو', 'Forex'), color: '#2962ff', onPress: () => onTab('forex') },
    { key: 'verify', icon: Scale, label: bi('پشکنین', 'Verify'), color: '#22c55e', onPress: onVerify },
    { key: 'news', icon: Newspaper, label: bi('هەواڵ', 'News'), color: '#f0b90b', onPress: onNews },
    { key: 'convert', icon: ArrowRightLeft, label: bi('گۆڕین', 'Convert'), color: '#f0b90b', onPress: onConvert },
    { key: 'invite', icon: UserPlus, label: bi('بانگهێشت', 'Invite'), color: TELEGRAM_BLUE, onPress: () => setInviteOpen(true) },
  ];

  return (
    <>
      <InviteFriendsModal open={inviteOpen} onClose={() => setInviteOpen(false)} bi={bi} />

      {/* More drawer */}
      {moreOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-[60] animate-fade-in"
            onClick={() => setMoreOpen(false)}
          />
          <div className="fixed bottom-0 inset-x-0 z-[70] bg-[#0d1117] border-t border-[#1a1e2e] rounded-t-3xl p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] animate-slide-up">
            <div className="flex items-center justify-between mb-4 px-1">
              <span className="text-sm font-bold text-white">{bi('زیاتر', 'More')}</span>
              <button
                onClick={() => setMoreOpen(false)}
                className="p-2 rounded-lg text-[#848e9c] hover:text-white hover:bg-[#1a1e2e] active:scale-90 transition"
                aria-label={bi('داخستن', 'Close')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {moreItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    onClick={() => { haptic(); setMoreOpen(false); item.onPress(); }}
                    className="flex flex-col items-center justify-center gap-2 py-4 rounded-2xl bg-[#161b26] hover:bg-[#1f2533] active:scale-95 transition min-h-[88px]"
                  >
                    <span
                      className="flex items-center justify-center h-11 w-11 rounded-full"
                      style={{ backgroundColor: `${item.color}1f` }}
                    >
                      <Icon className="h-5 w-5" style={{ color: item.color }} />
                    </span>
                    <span className="text-[11px] font-semibold text-[#c7cdd9]">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Bottom tab bar */}
      <nav className="shrink-0 z-50 flex items-stretch border-t border-[#1a1e2e] bg-[#0d1117]/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        {mainItems.map((item) => {
          const Icon = item.icon;
          const isTelegram = item.key === 'telegram';
          return (
            <button
              key={item.key}
              onClick={() => press(item.key, item.onPress)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[56px] py-1.5 transition-colors ${
                item.active ? 'text-[#f0b90b]' : 'text-[#848e9c] hover:text-[#c7cdd9]'
              }`}
              aria-current={item.active ? 'page' : undefined}
            >
              <span
                className={`relative inline-flex transition-transform ${tapped === item.key ? 'animate-tab-bounce' : ''}`}
                onAnimationEnd={() => setTapped(null)}
              >
                <Icon
                  size={22}
                  className={item.active ? 'fill-current' : ''}
                  style={isTelegram ? { color: TELEGRAM_BLUE } : undefined}
                />
                {isTelegram && subs != null && (
                  <span className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-1 flex items-center justify-center rounded-full bg-[#ff3b30] text-[9px] font-bold text-white leading-none">
                    {formatSubs(subs)}
                  </span>
                )}
              </span>
              <span className={`text-[10px] leading-none ${item.active ? 'font-bold' : 'font-medium'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
