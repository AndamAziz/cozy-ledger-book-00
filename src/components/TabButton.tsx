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
        'group relative p-2 sm:p-2.5 md:p-3.5 rounded-xl sm:rounded-2xl font-semibold transition-all duration-200',
        'flex flex-col items-center gap-1 sm:gap-1.5 md:gap-2',
        'border overflow-hidden',
        'active:scale-95 touch-manipulation',
        active 
          ? `bg-gradient-to-br ${colors.active} border-white/20 shadow-lg ${colors.glow}` 
          : 'bg-secondary/30 border-border/20 hover:bg-secondary/50 hover:border-primary/30'
      )}
    >
      {active && (
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
      )}
      
      {/* Icon */}
      <div className={cn(
        'relative z-10 w-8 h-8 sm:w-9 sm:h-9 md:w-12 md:h-12 rounded-lg sm:rounded-xl flex items-center justify-center transition-all duration-200',
        active 
          ? `bg-gradient-to-br ${colors.icon} text-white shadow-md ${colors.glow}` 
          : 'bg-secondary/60 text-muted-foreground group-hover:text-foreground'
      )}>
        {IconComponent ? (
          <IconComponent className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5" />
        ) : (
          <span className="text-base sm:text-lg">{icon}</span>
        )}
      </div>
      
      {/* Label */}
      <span className={cn(
        'relative z-10 text-[9px] sm:text-[10px] md:text-xs font-bold transition-colors truncate max-w-full',
        active ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'
      )}>
        {label}
      </span>
      
      {/* Active indicator */}
      {active && (
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 sm:w-8 h-0.5 rounded-full bg-gradient-to-r from-transparent via-white/50 to-transparent" />
      )}
    </button>
  );
}
