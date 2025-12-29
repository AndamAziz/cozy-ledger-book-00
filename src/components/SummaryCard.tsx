import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Wallet, Package, DollarSign } from 'lucide-react';

interface SummaryCardProps {
  title: string;
  value: string;
  variant?: 'income' | 'expense' | 'balance' | 'stock' | 'default';
  fullWidth?: boolean;
  icon?: string;
}

const variantConfig = {
  income: {
    color: 'text-success',
    bg: 'from-success/20 to-success/5',
    border: 'border-success/30',
    icon: TrendingUp,
    glow: 'shadow-success/10',
  },
  expense: {
    color: 'text-destructive',
    bg: 'from-destructive/20 to-destructive/5',
    border: 'border-destructive/30',
    icon: TrendingDown,
    glow: 'shadow-destructive/10',
  },
  balance: {
    color: 'text-info',
    bg: 'from-info/20 to-info/5',
    border: 'border-info/30',
    icon: Wallet,
    glow: 'shadow-info/10',
  },
  stock: {
    color: 'text-accent',
    bg: 'from-accent/20 to-accent/5',
    border: 'border-accent/30',
    icon: Package,
    glow: 'shadow-accent/10',
  },
  default: {
    color: 'text-foreground',
    bg: 'from-primary/10 to-primary/5',
    border: 'border-primary/20',
    icon: DollarSign,
    glow: 'shadow-primary/10',
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
      'hover:scale-[1.02] hover:shadow-xl',
      config.glow,
      fullWidth && 'col-span-2'
    )}>
      {/* Background decoration */}
      <div className={cn(
        'absolute -top-10 -left-10 w-24 h-24 rounded-full blur-2xl opacity-30 transition-opacity group-hover:opacity-50',
        variant === 'income' && 'bg-success',
        variant === 'expense' && 'bg-destructive',
        variant === 'balance' && 'bg-info',
        variant === 'stock' && 'bg-accent',
        variant === 'default' && 'bg-primary'
      )} />
      
      {/* Header */}
      <div className="relative flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon && <span className="text-lg">{icon}</span>}
          <h3 className="text-xs md:text-sm text-muted-foreground font-medium">{title}</h3>
        </div>
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center',
          'bg-background/50',
          config.color
        )}>
          <IconComponent className="h-4 w-4" />
        </div>
      </div>
      
      {/* Value */}
      <div className={cn(
        'relative text-xl md:text-2xl lg:text-3xl font-bold tracking-tight',
        config.color
      )}>
        {value}
      </div>
    </div>
  );
}
