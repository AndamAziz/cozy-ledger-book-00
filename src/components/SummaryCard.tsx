import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Wallet, Package, DollarSign, Sparkles } from 'lucide-react';

interface SummaryCardProps {
  title: string;
  value: string;
  variant?: 'income' | 'expense' | 'balance' | 'stock' | 'accent' | 'default';
  fullWidth?: boolean;
  icon?: string;
}

const variantConfig = {
  income: {
    color: 'text-success',
    bg: 'from-success/25 via-success/10 to-transparent',
    border: 'border-success/40',
    icon: TrendingUp,
    glow: 'hover:shadow-success/20',
    iconBg: 'from-success to-emerald-400',
  },
  expense: {
    color: 'text-destructive',
    bg: 'from-destructive/25 via-destructive/10 to-transparent',
    border: 'border-destructive/40',
    icon: TrendingDown,
    glow: 'hover:shadow-destructive/20',
    iconBg: 'from-destructive to-rose-400',
  },
  balance: {
    color: 'text-info',
    bg: 'from-info/25 via-info/10 to-transparent',
    border: 'border-info/40',
    icon: Wallet,
    glow: 'hover:shadow-info/20',
    iconBg: 'from-info to-blue-400',
  },
  stock: {
    color: 'text-accent',
    bg: 'from-accent/25 via-accent/10 to-transparent',
    border: 'border-accent/40',
    icon: Package,
    glow: 'hover:shadow-accent/20',
    iconBg: 'from-accent to-amber-400',
  },
  accent: {
    color: 'text-accent',
    bg: 'from-accent/25 via-accent/10 to-transparent',
    border: 'border-accent/40',
    icon: Package,
    glow: 'hover:shadow-accent/20',
    iconBg: 'from-accent to-amber-400',
  },
  default: {
    color: 'text-foreground',
    bg: 'from-primary/20 via-primary/10 to-transparent',
    border: 'border-primary/30',
    icon: DollarSign,
    glow: 'hover:shadow-primary/20',
    iconBg: 'from-primary to-teal-400',
  },
};

export function SummaryCard({ title, value, variant = 'default', fullWidth, icon }: SummaryCardProps) {
  const config = variantConfig[variant];
  const IconComponent = config.icon;
  
  return (
    <div className={cn(
      'group relative overflow-hidden rounded-2xl border p-4 md:p-5 transition-all duration-300',
      'bg-gradient-to-br backdrop-blur-xl',
      config.bg,
      config.border,
      'hover:scale-[1.03] hover:shadow-2xl active:scale-[0.98]',
      config.glow,
      fullWidth && 'col-span-2'
    )}>
      {/* Animated background decoration */}
      <div className={cn(
        'absolute -top-12 -right-12 w-28 h-28 rounded-full blur-2xl opacity-40 transition-all duration-500 group-hover:opacity-60 group-hover:scale-110',
        variant === 'income' && 'bg-success',
        variant === 'expense' && 'bg-destructive',
        variant === 'balance' && 'bg-info',
        variant === 'stock' && 'bg-accent',
        variant === 'accent' && 'bg-accent',
        variant === 'default' && 'bg-primary'
      )} />
      
      {/* Sparkle effect on hover */}
      <div className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <Sparkles className={cn('h-4 w-4', config.color)} />
      </div>
      
      {/* Header */}
      <div className="relative flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          {icon && <span className="text-xl md:text-2xl">{icon}</span>}
          <h3 className="text-sm md:text-base text-muted-foreground font-medium">{title}</h3>
        </div>
        <div className={cn(
          'w-10 h-10 md:w-11 md:h-11 rounded-xl flex items-center justify-center',
          'bg-gradient-to-br shadow-lg',
          config.iconBg
        )}>
          <IconComponent className="h-5 w-5 md:h-6 md:w-6 text-white" />
        </div>
      </div>
      
      {/* Value with enhanced styling */}
      <div className={cn(
        'relative text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight',
        config.color
      )}>
        {value}
      </div>
      
      {/* Bottom accent line */}
      <div className={cn(
        'absolute bottom-0 left-0 right-0 h-1 opacity-50',
        'bg-gradient-to-r from-transparent via-current to-transparent',
        config.color
      )} />
    </div>
  );
}
