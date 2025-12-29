import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SummaryCard } from './SummaryCard';
import { SellModal } from './SellModal';
import { Cigarette, Sale } from '@/types/finance';
import { formatCurrency } from '@/lib/format';
import { ShoppingCart, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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
  onAddSale: (sale: Omit<Sale, 'id'>, cigaretteId: number) => void;
  onDeleteSale: (id: number) => void;
}

export function SalesTab({
  salesData,
  cigaretteData,
  summary,
  maxDays,
  defaultDay,
  onAddSale,
  onDeleteSale,
}: SalesTabProps) {
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const { toast } = useToast();

  const handleSaleSubmit = (sale: Omit<Sale, 'id'>, cigaretteId: number) => {
    onAddSale(sale, cigaretteId);
    toast({ title: 'سەرکەوتوو', description: 'فرۆشتن تۆمارکرا' });
  };

  return (
    <div className="space-y-6">
      {/* Summary Grid */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 animate-fade-in">
        <SummaryCard title="فرۆشتنی ئەمڕۆ" value={formatCurrency(summary.todaySales)} variant="income" icon="📅" />
        <SummaryCard title="کۆی مانگ" value={formatCurrency(summary.monthSales)} variant="income" icon="📊" />
        <SummaryCard title="قازانجی جگەرە" value={formatCurrency(summary.cigaretteProfit)} variant="balance" icon="💰" fullWidth />
      </div>

      {/* Action Button */}
      <Button 
        onClick={() => setSellModalOpen(true)} 
        className="w-full btn-gradient-primary py-6 text-lg rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:scale-[1.01] transition-all duration-300 animate-fade-in"
        style={{ animationDelay: '100ms' }}
      >
        <ShoppingCart className="h-6 w-6 ml-2" />
        تۆمارکردنی فرۆشتن
      </Button>

      {/* Sales List */}
      <div className="glass-card p-4 md:p-6 animate-fade-in" style={{ animationDelay: '200ms' }}>
        <h3 className="text-lg font-bold text-foreground mb-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            <span className="text-xl">📋</span>
          </div>
          مێژووی فرۆشتن
        </h3>
        {salesData.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="w-20 h-20 rounded-2xl bg-secondary/50 flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl opacity-50">🛒</span>
            </div>
            <p className="text-sm">هیچ فرۆشتنێک نییە</p>
          </div>
        ) : (
          <div className="space-y-3">
            {salesData.map((sale, index) => (
              <div 
                key={sale.id} 
                className="group relative overflow-hidden rounded-xl bg-gradient-to-l from-primary/5 to-transparent border border-primary/10 p-4 flex justify-between items-center gap-4 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary font-bold">
                    {sale.day}
                  </div>
                  <div>
                    <div className="font-bold text-foreground flex items-center gap-2">
                      <span>{sale.cigaretteName}</span>
                      <span className="text-xs bg-secondary/50 px-2 py-0.5 rounded-full text-muted-foreground">
                        ڕۆژی {sale.day}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {sale.packs} پاکەت × {formatCurrency(sale.sellPrice)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-left">
                    <div className="text-success font-bold text-lg">{formatCurrency(sale.totalSale)}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <span className="text-info">قازانج:</span>
                      <span className="text-info font-semibold">{formatCurrency(sale.profit)}</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      if (confirm('دڵنیایت؟ پاکەتەکان دەگەڕێنەوە بۆ کۆگا.')) {
                        onDeleteSale(sale.id);
                        toast({ title: 'سەرکەوتوو', description: 'فرۆشتن سڕایەوە و پاکەتەکان گەڕانەوە' });
                      }
                    }}
                    className="p-2.5 rounded-xl bg-secondary/50 hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
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
      />
    </div>
  );
}
