import { cn } from '@/lib/utils';

interface SummaryCardProps {
  title: string;
  value: string;
  variant?: 'income' | 'expense' | 'balance' | 'stock' | 'default';
  fullWidth?: boolean;
  icon?: string;
}

const variantStyles = {
  income: 'text-success',
  expense: 'text-destructive',
  balance: 'text-info',
  stock: 'text-accent',
  default: 'text-foreground',
};

export function SummaryCard({ title, value, variant = 'default', fullWidth, icon }: SummaryCardProps) {
  return (
    <div className={cn('summary-card', fullWidth && 'col-span-2')}>
      <div className="flex items-center gap-2 mb-2">
        {icon && <span className="text-lg">{icon}</span>}
        <h3 className="text-xs md:text-sm text-muted-foreground uppercase tracking-wider">{title}</h3>
      </div>
      <div className={cn('text-xl md:text-2xl font-bold', variantStyles[variant])}>
        {value}
      </div>
    </div>
  );
}
