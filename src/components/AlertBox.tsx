import { Cigarette } from '@/types/finance';
import { AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface AlertBoxProps {
  lowStockItems: Cigarette[];
}

export function AlertBox({ lowStockItems }: AlertBoxProps) {
  const { t } = useLanguage();
  
  if (lowStockItems.length === 0) return null;

  return (
    <div className="mb-6 rounded-2xl p-4 bg-gradient-to-r from-warning/20 to-destructive/20 border border-warning/30 alert-pulse">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-5 w-5 text-warning" />
        <h3 className="font-bold text-foreground">{t('lowStockAlert')}</h3>
      </div>
      <ul className="space-y-2">
        {lowStockItems.map((item) => {
          const totalPacks = (item.boxes * item.packsPerBox) + (item.extraPacks || 0);
          return (
            <li key={item.id} className="text-sm text-foreground/80 border-b border-foreground/10 pb-2 last:border-0">
              🚬 <strong>{item.name}</strong> - {t('only')} {totalPacks} {t('packs')}!
            </li>
          );
        })}
      </ul>
    </div>
  );
}
