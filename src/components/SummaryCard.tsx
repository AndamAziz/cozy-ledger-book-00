import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Wallet, ShoppingCart, Receipt, Banknote, CreditCard, Scale } from 'lucide-react';

interface SummaryCardProps {
  title: string;
  value: string;
  variant?: 'income' | 'expense' | 'balance' | 'stock' | 'accent' | 'default' | 'cash' | 'card' | 'purchase' | 'cost';
  fullWidth?: boolean;
  icon?: string;
  delay?: number;
}

const variantConfig = {
  income: {
    color: 'text-success',
    valueBg: 'bg-success/10',
    border: 'border-success/25',
    cardBg: 'bg-gradient-to-br from-success/15 via-success/5 to-card/80',
    glow: 'hover:shadow-success/15',
    glowBg: 'bg-success',
    icon: TrendingUp,
    iconBg: 'bg-gradient-to-br from-success to-emerald-500',
    bar: 'bg-gradient-to-r from-success to-emerald-400',
  },
  expense: {
    color: 'text-destructive',
    valueBg: 'bg-destructive/10',
    border: 'border-destructive/25',
    cardBg: 'bg-gradient-to-br from-destructive/15 via-destructive/5 to-card/80',
    glow: 'hover:shadow-destructive/15',
    glowBg: 'bg-destructive',
    icon: TrendingDown,
    iconBg: 'bg-gradient-to-br from-destructive to-rose-500',
    bar: 'bg-gradient-to-r from-destructive to-rose-400',
  },
  balance: {
    color: 'text-info',
    valueBg: 'bg-info/10',
    border: 'border-info/25',
    cardBg: 'bg-gradient-to-br from-info/15 via-info/5 to-card/80',
    glow: 'hover:shadow-info/15',
    glowBg: 'bg-info',
    icon: Scale,
    iconBg: 'bg-gradient-to-br from-info to-blue-500',
    bar: 'bg-gradient-to-r from-info to-blue-400',
  },
  stock: {
    color: 'text-accent',
    valueBg: 'bg-accent/10',
    border: 'border-accent/25',
    cardBg: 'bg-gradient-to-br from-accent/15 via-accent/5 to-card/80',
    glow: 'hover:shadow-accent/15',
    glowBg: 'bg-accent',
    icon: ShoppingCart,
    iconBg: 'bg-gradient-to-br from-accent to-amber-500',
    bar: 'bg-gradient-to-r from-accent to-amber-400',
  },
  accent: {
    color: 'text-accent',
    valueBg: 'bg-accent/10',
    border: 'border-accent/25',
    cardBg: 'bg-gradient-to-br from-accent/15 via-accent/5 to-card/80',
    glow: 'hover:shadow-accent/15',
    glowBg: 'bg-accent',
    icon: ShoppingCart,
    iconBg: 'bg-gradient-to-br from-accent to-amber-500',
    bar: 'bg-gradient-to-r from-accent to-amber-400',
  },
  purchase: {
    color: 'text-accent',
    valueBg: 'bg-accent/10',
    border: 'border-accent/25',
    cardBg: 'bg-gradient-to-br from-accent/15 via-accent/5 to-card/80',
    glow: 'hover:shadow-accent/15',
    glowBg: 'bg-accent',
    icon: ShoppingCart,
    iconBg: 'bg-gradient-to-br from-accent to-amber-500',
    bar: 'bg-gradient-to-r from-accent to-amber-400',
  },
  cost: {
    color: 'text-destructive',
    valueBg: 'bg-destructive/10',
    border: 'border-destructive/25',
    cardBg: 'bg-gradient-to-br from-destructive/15 via-destructive/5 to-card/80',
    glow: 'hover:shadow-destructive/15',
    glowBg: 'bg-destructive',
    icon: Receipt,
    iconBg: 'bg-gradient-to-br from-destructive to-rose-500',
    bar: 'bg-gradient-to-r from-destructive to-rose-400',
  },
  cash: {
    color: 'text-success',
    valueBg: 'bg-success/10',
    border: 'border-success/25',
    cardBg: 'bg-gradient-to-br from-success/15 via-success/5 to-card/80',
    glow: 'hover:shadow-success/15',
    glowBg: 'bg-success',
    icon: Banknote,
    iconBg: 'bg-gradient-to-br from-success to-emerald-500',
    bar: 'bg-gradient-to-r from-success to-emerald-400',
  },
  card: {
    color: 'text-info',
    valueBg: 'bg-info/10',
    border: 'border-info/25',
    cardBg: 'bg-gradient-to-br from-info/15 via-info/5 to-card/80',
    glow: 'hover:shadow-info/15',
    glowBg: 'bg-info',
    icon: CreditCard,
    iconBg: 'bg-gradient-to-br from-info to-blue-500',
    bar: 'bg-gradient-to-r from-info to-blue-400',
  },
  default: {
    color: 'text-primary',
    valueBg: 'bg-primary/10',
    border: 'border-primary/25',
    cardBg: 'bg-gradient-to-br from-primary/15 via-primary/5 to-card/80',
    glow: 'hover:shadow-primary/15',
    glowBg: 'bg-primary',
    icon: Wallet,
    iconBg: 'bg-gradient-to-br from-primary to-teal-500',
    bar: 'bg-gradient-to-r from-primary to-teal-400',
  },
};

export function SummaryCard({ title, value, variant = 'default', fullWidth, delay = 0 }: SummaryCardProps) {
  const config = variantConfig[variant] ?? variantConfig.default;
  const IconComponent = config.icon;

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl border transition-all duration-300 animate-fade-in',
        config.cardBg,
        config.border,
        'hover:scale-[1.02] hover:shadow-xl active:scale-[0.98]',
        config.glow,
        fullWidth && 'col-span-2'
      )}
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      {/* Ambient glow blob */}
      <div className={cn(
        'absolute -top-10 -right-10 w-24 h-24 rounded-full blur-2xl opacity-20 transition-all duration-500 group-hover:opacity-35 group-hover:scale-125',
        config.glowBg
      )} />

      {/* Card content */}
      <div className="relative p-3.5 sm:p-4 md:p-5">
        {/* Top row: title + icon */}
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn(
              'w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3',
              config.iconBg
            )}>
              <IconComponent className="h-4 w-4 sm:h-4.5 sm:w-4.5 md:h-5 md:w-5 text-white" strokeWidth={2.2} />
            </div>
            <h3 className="text-xs sm:text-sm font-semibold text-muted-foreground truncate leading-tight">{title}</h3>
          </div>
        </div>

        {/* Value */}
        <div className={cn(
          'text-xl sm:text-2xl md:text-3xl font-bold tracking-tight leading-none',
          config.color
        )}>
          {value}
        </div>
      </div>

      {/* Bottom accent bar */}
      <div className={cn('absolute bottom-0 left-0 right-0 h-[3px] opacity-60 transition-opacity duration-300 group-hover:opacity-100', config.bar)} />
    </div>
  );
}
