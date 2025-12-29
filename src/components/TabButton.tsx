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

export function TabButton({ active, onClick, icon, label }: TabButtonProps) {
  const IconComponent = iconMap[icon];
  
  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative p-3 md:p-4 rounded-2xl font-semibold transition-all duration-300',
        'flex flex-col items-center gap-2 md:gap-3',
        'border-2 overflow-hidden',
        active 
          ? 'bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border-primary/50 shadow-lg shadow-primary/20' 
          : 'bg-secondary/30 border-border/30 hover:bg-secondary/50 hover:border-primary/30'
      )}
    >
      {/* Glow effect for active tab */}
      {active && (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent animate-pulse" />
      )}
      
      {/* Icon container */}
      <div className={cn(
        'relative z-10 w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center transition-all duration-300',
        active 
          ? 'bg-gradient-to-br from-primary to-success text-primary-foreground shadow-lg shadow-primary/30' 
          : 'bg-secondary/50 text-muted-foreground group-hover:bg-secondary group-hover:text-foreground'
      )}>
        {IconComponent ? (
          <IconComponent className="h-5 w-5 md:h-6 md:w-6" />
        ) : (
          <span className="text-xl md:text-2xl">{icon}</span>
        )}
      </div>
      
      {/* Label */}
      <span className={cn(
        'relative z-10 text-xs md:text-sm transition-colors duration-300',
        active ? 'text-foreground font-bold' : 'text-muted-foreground group-hover:text-foreground'
      )}>
        {label}
      </span>
      
      {/* Active indicator dot */}
      {active && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-primary shadow-lg shadow-primary/50" />
      )}
    </button>
  );
}
