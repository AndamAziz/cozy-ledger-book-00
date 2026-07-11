import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SummaryCard } from './SummaryCard';
import { SellModal } from './SellModal';
import { Cigarette, Sale, Location } from '@/types/finance';
import { formatCurrency, formatDate } from '@/lib/format';
import { formatCurrencyBy } from '@/lib/currency';
import { ShoppingCart, Trash2, Package, TrendingUp, MapPin } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';

interface SalesTabProps {
  salesData: Sale[];
  cigaretteData: Cigarette[];
  summary: {
    todaySales: number;
    monthSales: number;
    cigaretteProfit: number;
  };
  maxDays: number;
  defaultDay: number;
  currentMonthKey: string;
  locations: Location[];
  onAddLocation: (name: string) => Promise<Location | null>;
  onAddSale: (sale: Omit<Sale, 'id'>, cigaretteId: string | number) => void;
  onDeleteSale: (id: string | number) => void;
}

export function SalesTab({
  salesData,
  cigaretteData,
  summary,
  maxDays,
  defaultDay,
  currentMonthKey,
  locations,
  onAddLocation,
  onAddSale,
  onDeleteSale,
}: SalesTabProps) {
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const { toast } = useToast();
  const { t } = useLanguage();

  const handleSaleSubmit = (sale: Omit<Sale, 'id'>, cigaretteId: string | number) => {
    onAddSale(sale, cigaretteId);
    toast({ title: t('success'), description: t('recordSale') });
  };

  return (
    <div className="space-y-6">
      {/* Summary Grid */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 animate-fade-in">
        <SummaryCard title={t('todaySales')} value={formatCurrency(summary.todaySales)} variant="income" icon="📅" />
        <SummaryCard title={t('monthlySales')} value={formatCurrency(summary.monthSales)} variant="income" icon="📊" />
        <SummaryCard title={t('productProfit')} value={formatCurrency(summary.cigaretteProfit)} variant="balance" icon="💰" fullWidth />
      </div>

      {/* Action Button */}
      <Button 
        onClick={() => setSellModalOpen(true)} 
        className="w-full btn-gradient-primary py-6 text-lg rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:scale-[1.01] transition-all duration-300 animate-fade-in"
        style={{ animationDelay: '100ms' }}
      >
        <ShoppingCart className="h-6 w-6 ltr:mr-2 rtl:ml-2" />
        {t('recordSale')}
      </Button>

      {/* Sales List */}
      <div className="glass-card p-4 md:p-6 animate-fade-in" style={{ animationDelay: '200ms' }}>
        <h3 className="text-base md:text-lg font-bold text-foreground mb-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-teal-500 flex items-center justify-center shadow-md shadow-primary/30">
            <ShoppingCart className="h-4 w-4 text-white" />
          </div>
          <div>
            <span className="block">{t('sales')}</span>
            <span className="text-xs font-normal text-muted-foreground">{salesData.length} {t('records')}</span>
          </div>
        </h3>
        {salesData.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-secondary/80 to-secondary/40 flex items-center justify-center mx-auto mb-3 shadow-inner">
              <ShoppingCart className="h-8 w-8 opacity-40" />
            </div>
            <p className="text-sm font-medium">{t('noData')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {salesData.map((sale, index) => {
              const dateStr = formatDate(sale.day, currentMonthKey);
              return (
                <div
                  key={sale.id}
                  className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 px-3 py-2.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10 active:scale-[0.99] transition-all duration-200"
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  {/* Single row: day badge + name/pills + total + delete */}
                  <div className="flex items-center gap-3">
                    {/* Day badge — rounded-full circle, fixed size */}
                    <div className="w-9 h-9 flex-shrink-0 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/30 flex items-center justify-center shadow-sm">
                      <span className="text-primary font-bold text-[13px] font-mono leading-none">{sale.day}</span>
                    </div>

                    {/* Name + pills — always stacked vertically */}
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground text-xs font-semibold truncate leading-tight">{sale.cigaretteName}</p>
                      <div className="flex flex-col gap-0.5 mt-0.5">
                        <div className="flex items-center gap-1 bg-secondary/60 px-1.5 py-0.5 rounded-md w-fit">
                          <Package className="h-2.5 w-2.5 text-muted-foreground flex-shrink-0" />
                          <span className="text-muted-foreground text-[11px] font-mono">{sale.packs} {t('packs')}</span>
                        </div>
                        <div className="flex items-center gap-1 bg-info/10 px-1.5 py-0.5 rounded-md w-fit">
                          <TrendingUp className="h-2.5 w-2.5 text-info flex-shrink-0" />
                          <span className="text-info text-[11px] font-semibold font-mono">{formatCurrency(sale.profit)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Total */}
                    <div className="text-success font-bold text-[13px] font-mono flex-shrink-0">{formatCurrency(sale.totalSale)}</div>

                    {/* Delete */}
                    <button
                      onClick={() => {
                        if (confirm(t('confirmDelete'))) {
                          onDeleteSale(sale.id);
                          toast({ title: t('success'), description: t('delete') });
                        }
                      }}
                      className="p-1.5 rounded-lg bg-destructive/15 hover:bg-destructive/25 text-destructive transition-all duration-200 active:scale-95 flex-shrink-0"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      <SellModal
        isOpen={sellModalOpen}
        onClose={() => setSellModalOpen(false)}
        onSubmit={handleSaleSubmit}
        cigarettes={cigaretteData}
        maxDays={maxDays}
        defaultDay={defaultDay}
        monthKey={currentMonthKey}
      />
    </div>
  );
}
