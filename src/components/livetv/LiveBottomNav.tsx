import { Tv, Film, Clapperboard, History } from 'lucide-react';

export type LiveTab = 'direct' | 'movies' | 'series' | 'replay';

const TABS: { key: LiveTab; label: string; icon: typeof Tv }[] = [
  { key: 'direct', label: 'Direct', icon: Tv },
  { key: 'movies', label: 'Movies', icon: Film },
  { key: 'series', label: 'Series', icon: Clapperboard },
  { key: 'replay', label: 'Replay', icon: History },
];

export function LiveBottomNav({ active, onChange }: { active: LiveTab; onChange: (t: LiveTab) => void }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-white/10 bg-[#0a0a0f]/95 safe-x pb-[env(safe-area-inset-bottom)] backdrop-blur-xl shadow-[0_-8px_24px_rgba(0,0,0,0.6)]">
      {TABS.map(({ key, label, icon: Icon }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            onClick={() => {
              try { navigator.vibrate?.(10); } catch { /* noop */ }
              onChange(key);
            }}
            aria-current={isActive ? 'page' : undefined}
            className="relative flex min-h-[58px] flex-1 flex-col items-center justify-center gap-1 transition-colors 2xl:min-h-[74px]"
            style={{ color: isActive ? '#ff2d6f' : 'rgba(255,255,255,0.45)' }}
          >
            {isActive && (
              <span
                className="absolute inset-x-5 top-0 h-0.5 rounded-full"
                style={{ background: '#ff2d6f', boxShadow: '0 0 14px #ff2d6f' }}
              />
            )}
            <Icon
              className="h-[21px] w-[21px] 2xl:h-7 2xl:w-7"
              style={isActive ? { filter: 'drop-shadow(0 0 8px #ff2d6f)' } : undefined}
            />
            <span className={`text-[10px] leading-none 2xl:text-xs ${isActive ? 'font-bold' : 'font-medium'}`}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
