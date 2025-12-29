import { Button } from '@/components/ui/button';
import { SummaryCard } from './SummaryCard';
import { Cigarette, Sale, Income, Expense } from '@/types/finance';
import { formatCurrency } from '@/lib/format';
import { generatePDFReport } from '@/lib/pdfGenerator';
import { FileDown, Share2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ReportsTabProps {
  incomeData: Income[];
  expenseData: Expense[];
  cigaretteData: Cigarette[];
  salesData: Sale[];
  summary: {
    totalIncome: number;
    totalExpense: number;
    balance: number;
    totalStockValue: number;
    cigaretteProfit: number;
    totalCash: number;
    totalCard: number;
  };
  currentMonthLabel: string;
}

export function ReportsTab({
  incomeData,
  expenseData,
  cigaretteData,
  salesData,
  summary,
  currentMonthLabel,
}: ReportsTabProps) {
  const { toast } = useToast();
  const netProfit = summary.balance + summary.cigaretteProfit;

  const handleDownloadPDF = () => {
    try {
      generatePDFReport({
        monthLabel: currentMonthLabel,
        incomeData,
        expenseData,
        cigaretteData,
        salesData,
        summary: {
          ...summary,
          totalCash: summary.totalCash || 0,
          totalCard: summary.totalCard || 0,
        },
      });
      toast({ title: 'سەرکەوتوو', description: 'ڕاپۆرتی PDF داگیرا' });
    } catch (error) {
      toast({ title: 'هەڵە', description: 'نەتوانرا ڕاپۆرت دروست بکرێت', variant: 'destructive' });
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: `ڕاپۆرتی داراییی - ${currentMonthLabel}`,
      text: `کۆی داهات: ${formatCurrency(summary.totalIncome)}\nکۆی خەرجی: ${formatCurrency(summary.totalExpense)}\nقازانجی پاک: ${formatCurrency(netProfit)}`,
    };
    
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        // User cancelled sharing
      }
    } else {
      // Fallback: copy to clipboard
      await navigator.clipboard.writeText(shareData.text);
      toast({ title: 'سەرکەوتوو', description: 'ڕاپۆرت کۆپی کرا' });
    }
  };

  // Calculate total by box
  const boxReport = cigaretteData.map(cig => ({
    name: cig.name,
    boxes: cig.boxes,
    value: cig.boxes * cig.boxPrice,
  }));
  const totalBoxValue = boxReport.reduce((sum, r) => sum + r.value, 0);

  // Calculate total by pack
  const packReport = cigaretteData.map(cig => {
    const totalPacks = (cig.boxes * cig.packsPerBox) + (cig.extraPacks || 0);
    return {
      name: cig.name,
      packs: totalPacks,
      value: totalPacks * cig.packPrice,
    };
  });
  const totalPackValue = packReport.reduce((sum, r) => sum + r.value, 0);

  // Sales by cigarette
  const salesByType = cigaretteData.map(cig => {
    const cigSales = salesData.filter(s => s.cigaretteId === cig.id);
    const totalPacks = cigSales.reduce((sum, s) => sum + s.packs, 0);
    const totalRevenue = cigSales.reduce((sum, s) => sum + s.totalSale, 0);
    const totalProfit = cigSales.reduce((sum, s) => sum + s.profit, 0);
    return {
      name: cig.name,
      packs: totalPacks,
      revenue: totalRevenue,
      profit: totalProfit,
    };
  }).filter(s => s.packs > 0);

  return (
    <div className="fade-in space-y-6">
      {/* Header with Export Buttons */}
      <div className="glass-card p-4">
        <h2 className="text-xl font-bold text-foreground text-center mb-4">ڕاپۆرتی {currentMonthLabel}</h2>
        <div className="grid grid-cols-2 gap-3">
          <Button onClick={handleDownloadPDF} className="btn-gradient-primary py-4">
            <FileDown className="h-5 w-5 ml-2" />
            داگرتنی PDF
          </Button>
          <Button onClick={handleShare} variant="secondary" className="py-4">
            <Share2 className="h-5 w-5 ml-2" />
            هاوبەشکردن
          </Button>
        </div>
      </div>

      {/* Summary Grid */}
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <SummaryCard title="کۆی داهات" value={formatCurrency(summary.totalIncome)} variant="income" icon="📈" />
        <SummaryCard title="کۆی خەرجی" value={formatCurrency(summary.totalExpense)} variant="expense" icon="📉" />
        <SummaryCard title="قازانجی پاک" value={formatCurrency(netProfit)} variant="balance" icon="💎" />
        <SummaryCard title="بەهای کۆگا" value={formatCurrency(summary.totalStockValue)} variant="stock" icon="📦" />
      </div>

      {/* Sales by Type */}
      {salesByType.length > 0 && (
        <div className="glass-card p-4 md:p-5">
          <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
            <span>🛒</span> فرۆشتن بە جۆر
          </h3>
          <div className="space-y-3">
            {salesByType.map((item, index) => (
              <div key={index} className="report-item">
                <div>
                  <div className="font-bold text-foreground">{item.name}</div>
                  <div className="text-sm text-muted-foreground">{item.packs} پاکەت فرۆشراوە</div>
                </div>
                <div className="text-left">
                  <div className="text-success font-bold">{formatCurrency(item.revenue)}</div>
                  <div className="text-xs text-muted-foreground">قازانج: {formatCurrency(item.profit)}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="grand-total mt-4">
            <div className="text-sm text-foreground/80 mb-1">کۆی گشتی فرۆشتن</div>
            <div className="text-3xl font-bold text-foreground">
              {formatCurrency(salesByType.reduce((sum, s) => sum + s.revenue, 0))}
            </div>
          </div>
        </div>
      )}

      {/* Stock by Box */}
      <div className="glass-card p-4 md:p-5">
        <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
          <span>📦</span> ڕاپۆرتی کۆگا بە بۆکس
        </h3>
        {boxReport.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">هیچ بۆکسێک نییە</div>
        ) : (
          <>
            <div className="space-y-3">
              {boxReport.map((item, index) => (
                <div key={index} className="report-item">
                  <div>
                    <div className="font-bold text-foreground">{item.name}</div>
                    <div className="text-sm text-muted-foreground">{item.boxes} بۆکس</div>
                  </div>
                  <div className="text-info font-bold">{formatCurrency(item.value)}</div>
                </div>
              ))}
            </div>
            <div className="grand-total mt-4">
              <div className="text-sm text-foreground/80 mb-1">کۆی گشتی بەهای بۆکسەکان</div>
              <div className="text-3xl font-bold text-foreground">{formatCurrency(totalBoxValue)}</div>
            </div>
          </>
        )}
      </div>

      {/* Stock by Pack */}
      <div className="glass-card p-4 md:p-5">
        <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
          <span>🚬</span> ڕاپۆرتی کۆگا بە پاکەت
        </h3>
        {packReport.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">هیچ پاکەتێک نییە</div>
        ) : (
          <>
            <div className="space-y-3">
              {packReport.map((item, index) => (
                <div key={index} className="report-item">
                  <div>
                    <div className="font-bold text-foreground">{item.name}</div>
                    <div className="text-sm text-muted-foreground">{item.packs} پاکەت</div>
                  </div>
                  <div className="text-success font-bold">{formatCurrency(item.value)}</div>
                </div>
              ))}
            </div>
            <div className="grand-total mt-4">
              <div className="text-sm text-foreground/80 mb-1">کۆی گشتی بەهای پاکەتەکان</div>
              <div className="text-3xl font-bold text-foreground">{formatCurrency(totalPackValue)}</div>
            </div>
          </>
        )}
      </div>

      {/* Expense Summary */}
      {expenseData.length > 0 && (
        <div className="glass-card p-4 md:p-5">
          <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
            <span>💸</span> کورتەی خەرجییەکان
          </h3>
          <div className="space-y-3">
            {expenseData.map((exp) => (
              <div key={exp.id} className="report-item">
                <div>
                  <div className="font-bold text-foreground">{exp.name}</div>
                  <div className="text-sm text-muted-foreground truncate max-w-[200px]">{exp.purpose}</div>
                </div>
                <div className="text-destructive font-bold">{formatCurrency(exp.amount)}</div>
              </div>
            ))}
          </div>
          <div className="bg-destructive/10 rounded-xl p-4 mt-4 text-center">
            <div className="text-sm text-destructive/80 mb-1">کۆی گشتی خەرجی</div>
            <div className="text-2xl font-bold text-destructive">{formatCurrency(summary.totalExpense)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
