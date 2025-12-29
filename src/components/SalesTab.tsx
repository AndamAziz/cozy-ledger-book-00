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
    <div className="fade-in space-y-6">
      {/* Summary Grid */}
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <SummaryCard title="فرۆشتنی ئەمڕۆ" value={formatCurrency(summary.todaySales)} variant="income" icon="📅" />
        <SummaryCard title="کۆی مانگ" value={formatCurrency(summary.monthSales)} variant="income" icon="📊" />
        <SummaryCard title="قازانجی جگەرە" value={formatCurrency(summary.cigaretteProfit)} variant="balance" icon="💰" fullWidth />
      </div>

      {/* Action Button */}
      <Button 
        onClick={() => setSellModalOpen(true)} 
        className="w-full btn-gradient-primary py-5 text-lg"
      >
        <ShoppingCart className="h-5 w-5 ml-2" />
        تۆمارکردنی فرۆشتن
      </Button>

      {/* Sales List */}
      <div className="glass-card p-4 md:p-5">
        <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
          <span>📋</span> مێژووی فرۆشتن
        </h3>
        {salesData.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <div className="text-4xl mb-3">🛒</div>
            <p>هیچ فرۆشتنێک نییە</p>
          </div>
        ) : (
          <div className="space-y-3">
            {salesData.map((sale) => (
              <div key={sale.id} className="report-item">
                <div>
                  <div className="font-bold text-foreground">ڕۆژی {sale.day} - {sale.cigaretteName}</div>
                  <div className="text-sm text-muted-foreground">
                    {sale.packs} پاکەت × {formatCurrency(sale.sellPrice)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-left">
                    <div className="text-success font-bold">{formatCurrency(sale.totalSale)}</div>
                    <div className="text-xs text-muted-foreground">
                      قازانج: {formatCurrency(sale.profit)}
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      if (confirm('دڵنیایت؟ پاکەتەکان دەگەڕێنەوە بۆ کۆگا.')) {
                        onDeleteSale(sale.id);
                        toast({ title: 'سەرکەوتوو', description: 'فرۆشتن سڕایەوە و پاکەتەکان گەڕانەوە' });
                      }
                    }}
                    className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
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
