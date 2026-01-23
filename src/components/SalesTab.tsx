import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SummaryCard } from './SummaryCard';
import { SellModal } from './SellModal';
import { Cigarette, Sale } from '@/types/finance';
import { formatCurrency, formatDate } from '@/lib/format';
import { ShoppingCart, Trash2 } from 'lucide-react';
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
        <h3 className="text-lg font-bold text-foreground mb-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            <span className="text-xl">📋</span>
          </div>
          {t('sales')}
        </h3>
        {salesData.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="w-20 h-20 rounded-2xl bg-secondary/50 flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl opacity-50">🛒</span>
            </div>
            <p className="text-sm">{t('noData')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {salesData.map((sale, index) => {
              const dateStr = formatDate(sale.day, currentMonthKey);
              
              return (
                <div 
                  key={sale.id} 
                  className="group relative overflow-hidden rounded-xl bg-gradient-to-l from-primary/5 to-transparent border border-primary/10 p-3 md:p-4 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary font-bold text-sm md:text-base font-mono">
                          {sale.day}
                        </div>
                        <div>
                          <div className="font-bold text-foreground text-sm md:text-base">{sale.cigaretteName}</div>
                          <div className="text-xs md:text-sm text-muted-foreground font-mono tracking-wide">{dateStr}</div>
                        </div>
                      </div>
                      <div className="text-success font-bold text-base md:text-lg">{formatCurrency(sale.totalSale)}</div>
                    </div>
                    
                    <div className="flex items-center justify-between border-t border-border/30 pt-3">
                      <div className="flex gap-4 text-xs md:text-sm">
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground">📦</span>
                          <span className="text-foreground font-medium">{sale.packs} {t('packs')}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground">💵</span>
                          <span className="text-foreground font-medium">{formatCurrency(sale.packPrice)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-info">{t('profit')}:</span>
                          <span className="text-info font-semibold">{formatCurrency(sale.profit)}</span>
                        </div>
                      </div>
                      
                      <button 
                        onClick={() => {
                          if (confirm(t('confirmDelete'))) {
                            onDeleteSale(sale.id);
                            toast({ title: t('success'), description: t('delete') });
                          }
                        }}
                        className="p-2 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive transition-all duration-200 hover:scale-105"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
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
