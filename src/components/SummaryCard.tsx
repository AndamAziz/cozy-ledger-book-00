import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Wallet, ShoppingCart, Receipt, Banknote, CreditCard, Scale } from 'lucide-react';

interface SummaryCardProps {
  title: string;
  value?: string;
  lines?: string[];
  variant?: 'income' | 'expense' | 'balance' | 'stock' | 'accent' | 'default' | 'cash' | 'card' | 'purchase' | 'cost';
  fullWidth?: boolean;
  icon?: string;
  delay?: number;
}

const variantConfig = {
  income: {
    color: 'text-success',
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
        'group relative overflow-hidden rounded-xl sm:rounded-2xl border transition-all duration-300 animate-fade-in',
        config.cardBg,
        config.border,
        'active:scale-[0.98]',
        config.glow,
        fullWidth && 'col-span-2'
      )}
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      {/* Ambient glow */}
      <div className={cn(
        'absolute -top-8 -right-8 w-20 h-20 rounded-full blur-2xl opacity-15',
        config.glowBg
      )} />

      {/* Content */}
      <div className="relative p-3 sm:p-3.5 md:p-5">
        <div className="flex items-center gap-2 mb-2 sm:mb-3">
          <div className={cn(
            'w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 rounded-lg sm:rounded-xl flex items-center justify-center shadow-md flex-shrink-0',
            config.iconBg
          )}>
            <IconComponent className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5 text-white" strokeWidth={2.2} />
          </div>
          <h3 className="text-[10px] sm:text-xs font-semibold text-muted-foreground truncate leading-tight">{title}</h3>
        </div>

        <div className={cn(
          'text-lg sm:text-xl md:text-2xl font-bold tracking-tight leading-none',
          config.color
        )}>
          {value}
        </div>
      </div>

      {/* Bottom bar */}
      <div className={cn('absolute bottom-0 left-0 right-0 h-[2px] opacity-50', config.bar)} />
    </div>
  );
}
