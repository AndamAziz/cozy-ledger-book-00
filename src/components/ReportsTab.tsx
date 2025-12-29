import { Button } from '@/components/ui/button';
import { SummaryCard } from './SummaryCard';
import { DailyIncomeChart, SalesByProductChart, ProfitChart, IncomeExpenseComparison } from './Charts';
import { Cigarette, Sale, Income, Expense } from '@/types/finance';
import { formatCurrency } from '@/lib/format';
import { generatePDFReport } from '@/lib/pdfGenerator';
import { FileDown, Share2, TrendingUp, Package, ShoppingCart, Wallet } from 'lucide-react';
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
    <div className="space-y-6">
      {/* Header with Export Buttons */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-transparent to-transparent p-5 animate-fade-in">
        <div className="absolute -top-16 -left-16 w-40 h-40 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative">
          <div className="flex items-center justify-center gap-3 mb-5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-success flex items-center justify-center shadow-lg shadow-primary/30">
              <TrendingUp className="h-6 w-6 text-primary-foreground" />
            </div>
            <h2 className="text-xl font-bold bg-gradient-to-l from-primary to-foreground bg-clip-text text-transparent">
              ڕاپۆرتی {currentMonthLabel}
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button 
              onClick={handleDownloadPDF} 
              className="btn-gradient-primary py-5 rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:scale-[1.02] transition-all duration-300"
            >
              <FileDown className="h-5 w-5 ml-2" />
              داگرتنی PDF
            </Button>
            <Button 
              onClick={handleShare} 
              variant="secondary" 
              className="py-5 rounded-xl hover:bg-secondary hover:scale-[1.02] transition-all duration-300"
            >
              <Share2 className="h-5 w-5 ml-2" />
              هاوبەشکردن
            </Button>
          </div>
        </div>
      </div>

      {/* Summary Grid */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 animate-fade-in" style={{ animationDelay: '100ms' }}>
        <SummaryCard title="کۆی داهات" value={formatCurrency(summary.totalIncome)} variant="income" icon="📈" />
        <SummaryCard title="کۆی خەرجی" value={formatCurrency(summary.totalExpense)} variant="expense" icon="📉" />
        <SummaryCard title="قازانجی پاک" value={formatCurrency(netProfit)} variant="balance" icon="💎" />
        <SummaryCard title="بەهای کۆگا" value={formatCurrency(summary.totalStockValue)} variant="stock" icon="📦" />
      </div>

      {/* Charts Section */}
      <div className="grid gap-6 md:grid-cols-2 animate-fade-in" style={{ animationDelay: '200ms' }}>
        {/* Income Comparison Chart */}
        <div className="glass-card p-5 md:p-6 hover:border-primary/30 transition-colors">
          <h3 className="text-lg font-bold text-foreground mb-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <span className="text-xl">📊</span>
            </div>
            بەراوردی داهات و خەرجی
          </h3>
          <IncomeExpenseComparison 
            totalIncome={summary.totalIncome}
            totalExpense={summary.totalExpense}
            cigaretteProfit={summary.cigaretteProfit}
          />
        </div>

        {/* Sales by Product Pie Chart */}
        <div className="glass-card p-5 md:p-6 hover:border-accent/30 transition-colors">
          <h3 className="text-lg font-bold text-foreground mb-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center">
              <span className="text-xl">🥧</span>
            </div>
            فرۆشتن بە جۆر
          </h3>
          <SalesByProductChart salesData={salesData} cigaretteData={cigaretteData} />
        </div>
      </div>

      {/* Daily Income Chart */}
      <div className="glass-card p-5 md:p-6 animate-fade-in hover:border-success/30 transition-colors" style={{ animationDelay: '300ms' }}>
        <h3 className="text-lg font-bold text-foreground mb-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-success/20 to-success/5 flex items-center justify-center">
            <span className="text-xl">📈</span>
          </div>
          داهاتی ڕۆژانە
        </h3>
        <DailyIncomeChart data={incomeData} />
      </div>

      {/* Profit Chart */}
      <div className="glass-card p-5 md:p-6 animate-fade-in hover:border-info/30 transition-colors" style={{ animationDelay: '400ms' }}>
        <h3 className="text-lg font-bold text-foreground mb-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-info/20 to-info/5 flex items-center justify-center">
            <span className="text-xl">💰</span>
          </div>
          قازانجی ڕۆژانە
        </h3>
        <ProfitChart salesData={salesData} />
      </div>

      {/* Sales by Type */}
      {salesByType.length > 0 && (
        <div className="glass-card p-5 md:p-6 animate-fade-in" style={{ animationDelay: '500ms' }}>
          <h3 className="text-lg font-bold text-foreground mb-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <ShoppingCart className="h-5 w-5 text-primary" />
            </div>
            فرۆشتن بە جۆر
          </h3>
          <div className="space-y-3">
            {salesByType.map((item, index) => (
              <div 
                key={index} 
                className="group relative overflow-hidden rounded-xl bg-gradient-to-l from-success/5 to-transparent border border-success/10 p-4 flex justify-between items-center gap-4 hover:border-success/30 hover:shadow-lg hover:shadow-success/5 transition-all duration-300"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center text-success text-sm font-bold">
                    {item.packs}
                  </div>
                  <div>
                    <div className="font-bold text-foreground">{item.name}</div>
                    <div className="text-sm text-muted-foreground">{item.packs} پاکەت فرۆشراوە</div>
                  </div>
                </div>
                <div className="text-left">
                  <div className="text-success font-bold text-lg">{formatCurrency(item.revenue)}</div>
                  <div className="text-xs text-info">قازانج: {formatCurrency(item.profit)}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-primary/30 p-6 mt-5 text-center">
            <div className="absolute -top-10 -right-10 w-24 h-24 rounded-full bg-primary/20 blur-2xl" />
            <div className="relative">
              <div className="text-sm text-foreground/80 mb-2">کۆی گشتی فرۆشتن</div>
              <div className="text-3xl font-bold bg-gradient-to-l from-primary to-success bg-clip-text text-transparent">
                {formatCurrency(salesByType.reduce((sum, s) => sum + s.revenue, 0))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stock by Box */}
      <div className="glass-card p-5 md:p-6 animate-fade-in" style={{ animationDelay: '600ms' }}>
        <h3 className="text-lg font-bold text-foreground mb-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-info/20 to-info/5 flex items-center justify-center">
            <Package className="h-5 w-5 text-info" />
          </div>
          ڕاپۆرتی کۆگا بە بۆکس
        </h3>
        {boxReport.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="w-16 h-16 rounded-2xl bg-secondary/50 flex items-center justify-center mx-auto mb-3">
              <Package className="h-8 w-8 opacity-50" />
            </div>
            <p className="text-sm">هیچ بۆکسێک نییە</p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {boxReport.map((item, index) => (
                <div 
                  key={index} 
                  className="group relative overflow-hidden rounded-xl bg-gradient-to-l from-info/5 to-transparent border border-info/10 p-4 flex justify-between items-center gap-4 hover:border-info/30 hover:shadow-lg hover:shadow-info/5 transition-all duration-300"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center text-info text-sm font-bold">
                      {item.boxes}
                    </div>
                    <div>
                      <div className="font-bold text-foreground">{item.name}</div>
                      <div className="text-sm text-muted-foreground">{item.boxes} بۆکس</div>
                    </div>
                  </div>
                  <div className="text-info font-bold text-lg">{formatCurrency(item.value)}</div>
                </div>
              ))}
            </div>
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-info/20 via-info/10 to-transparent border border-info/30 p-6 mt-5 text-center">
              <div className="absolute -top-10 -right-10 w-24 h-24 rounded-full bg-info/20 blur-2xl" />
              <div className="relative">
                <div className="text-sm text-foreground/80 mb-2">کۆی گشتی بەهای بۆکسەکان</div>
                <div className="text-3xl font-bold text-info">{formatCurrency(totalBoxValue)}</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Stock by Pack */}
      <div className="glass-card p-5 md:p-6 animate-fade-in" style={{ animationDelay: '700ms' }}>
        <h3 className="text-lg font-bold text-foreground mb-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-success/20 to-success/5 flex items-center justify-center">
            <span className="text-xl">🚬</span>
          </div>
          ڕاپۆرتی کۆگا بە پاکەت
        </h3>
        {packReport.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="w-16 h-16 rounded-2xl bg-secondary/50 flex items-center justify-center mx-auto mb-3">
              <span className="text-3xl opacity-50">🚬</span>
            </div>
            <p className="text-sm">هیچ پاکەتێک نییە</p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {packReport.map((item, index) => (
                <div 
                  key={index} 
                  className="group relative overflow-hidden rounded-xl bg-gradient-to-l from-success/5 to-transparent border border-success/10 p-4 flex justify-between items-center gap-4 hover:border-success/30 hover:shadow-lg hover:shadow-success/5 transition-all duration-300"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center text-success text-sm font-bold">
                      {item.packs}
                    </div>
                    <div>
                      <div className="font-bold text-foreground">{item.name}</div>
                      <div className="text-sm text-muted-foreground">{item.packs} پاکەت</div>
                    </div>
                  </div>
                  <div className="text-success font-bold text-lg">{formatCurrency(item.value)}</div>
                </div>
              ))}
            </div>
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-success/20 via-success/10 to-transparent border border-success/30 p-6 mt-5 text-center">
              <div className="absolute -top-10 -right-10 w-24 h-24 rounded-full bg-success/20 blur-2xl" />
              <div className="relative">
                <div className="text-sm text-foreground/80 mb-2">کۆی گشتی بەهای پاکەتەکان</div>
                <div className="text-3xl font-bold text-success">{formatCurrency(totalPackValue)}</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Expense Summary */}
      {expenseData.length > 0 && (
        <div className="glass-card p-5 md:p-6 animate-fade-in" style={{ animationDelay: '800ms' }}>
          <h3 className="text-lg font-bold text-foreground mb-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-destructive/20 to-destructive/5 flex items-center justify-center">
              <Wallet className="h-5 w-5 text-destructive" />
            </div>
            کورتەی خەرجییەکان
          </h3>
          <div className="space-y-3">
            {expenseData.map((exp, index) => (
              <div 
                key={exp.id} 
                className="group relative overflow-hidden rounded-xl bg-gradient-to-l from-destructive/5 to-transparent border border-destructive/10 p-4 flex justify-between items-center gap-4 hover:border-destructive/30 hover:shadow-lg hover:shadow-destructive/5 transition-all duration-300"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center text-destructive text-sm font-bold">
                    {index + 1}
                  </div>
                  <div>
                    <div className="font-bold text-foreground">{exp.name}</div>
                    <div className="text-sm text-muted-foreground truncate max-w-[200px]">{exp.purpose}</div>
                  </div>
                </div>
                <div className="text-destructive font-bold text-lg">{formatCurrency(exp.amount)}</div>
              </div>
            ))}
          </div>
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-destructive/20 via-destructive/10 to-transparent border border-destructive/30 p-6 mt-5 text-center">
            <div className="absolute -top-10 -right-10 w-24 h-24 rounded-full bg-destructive/20 blur-2xl" />
            <div className="relative">
              <div className="text-sm text-foreground/80 mb-2">کۆی گشتی خەرجی</div>
              <div className="text-3xl font-bold text-destructive">{formatCurrency(summary.totalExpense)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
