import { cn } from '@/lib/utils';
import { LucideIcon, Wallet, Package, ShoppingCart, BarChart3 } from 'lucide-react';

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
}

const iconMap: Record<string, LucideIcon> = {
  '💰': Wallet,
  '📦': Package,
  '🛒': ShoppingCart,
  '📊': BarChart3,
};

const colorMap: Record<string, { active: string; icon: string; glow: string }> = {
  '💰': { active: 'from-success/30 to-success/5', icon: 'from-success to-emerald-400', glow: 'shadow-success/40' },
  '📦': { active: 'from-accent/30 to-accent/5', icon: 'from-accent to-amber-400', glow: 'shadow-accent/40' },
  '🛒': { active: 'from-primary/30 to-primary/5', icon: 'from-primary to-teal-400', glow: 'shadow-primary/40' },
  '📊': { active: 'from-info/30 to-info/5', icon: 'from-info to-blue-400', glow: 'shadow-info/40' },
};

export function TabButton({ active, onClick, icon, label }: TabButtonProps) {
  const IconComponent = iconMap[icon];
  const colors = colorMap[icon] || colorMap['💰'];
  
  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative p-3 md:p-4 rounded-2xl font-semibold transition-all duration-300',
        'flex flex-col items-center gap-2 md:gap-3',
        'border-2 overflow-hidden',
        'active:scale-95 touch-manipulation',
        active 
          ? `bg-gradient-to-br ${colors.active} border-white/20 shadow-xl ${colors.glow}` 
          : 'bg-secondary/40 border-border/30 hover:bg-secondary/60 hover:border-primary/30 hover:shadow-lg'
      )}
    >
      {/* Animated background gradient for active */}
      {active && (
        <>
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
          <div className="absolute -inset-1 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-pulse" />
        </>
      )}
      
      {/* Icon container with enhanced styling */}
      <div className={cn(
        'relative z-10 w-11 h-11 md:w-14 md:h-14 rounded-2xl flex items-center justify-center transition-all duration-300',
        active 
          ? `bg-gradient-to-br ${colors.icon} text-white shadow-lg ${colors.glow}` 
          : 'bg-secondary/80 text-muted-foreground group-hover:bg-secondary group-hover:text-foreground group-hover:scale-105'
      )}>
        {IconComponent ? (
          <IconComponent className={cn(
            'h-5 w-5 md:h-6 md:w-6 transition-transform duration-300',
            active && 'animate-pulse'
          )} />
        ) : (
          <span className="text-xl md:text-2xl">{icon}</span>
        )}
      </div>
      
      {/* Label with better visibility */}
      <span className={cn(
        'relative z-10 text-xs md:text-sm font-bold transition-all duration-300',
        active ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'
      )}>
        {label}
      </span>
      
      {/* Active indicator line */}
      {active && (
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 rounded-full bg-gradient-to-r from-transparent via-white/50 to-transparent" />
      )}
    </button>
  );
}
