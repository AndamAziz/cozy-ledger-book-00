import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SummaryCard } from './SummaryCard';
import { IncomeModal } from './IncomeModal';
import { ExpenseModal } from './ExpenseModal';
import { Income, Expense, ExpenseType } from '@/types/finance';
import { formatCurrency, formatDate } from '@/lib/format';
import { Plus, Pencil, Trash2, ShoppingCart, Receipt, Banknote, CreditCard, TrendingUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';

interface FinanceTabProps {
  incomeData: Income[];
  expenseData: Expense[];
  summary: {
    totalCash: number;
    totalCard: number;
    totalIncome: number;
    totalExpense: number;
    balance: number;
  };
  maxDays: number;
  defaultDay: number;
  currentMonthKey: string;
  onAddIncome: (income: Omit<Income, 'id'>) => void;
  onUpdateIncome: (id: string | number, income: Omit<Income, 'id'>) => void;
  onDeleteIncome: (id: string | number) => void;
  onAddExpense: (expense: Omit<Expense, 'id'>) => void;
  onUpdateExpense: (id: string | number, expense: Omit<Expense, 'id'>) => void;
  onDeleteExpense: (id: string | number) => void;
  onClearAll: () => void;
}

export function FinanceTab({
  incomeData,
  expenseData,
  summary,
  maxDays,
  defaultDay,
  currentMonthKey,
  onAddIncome,
  onUpdateIncome,
  onDeleteIncome,
  onAddExpense,
  onUpdateExpense,
  onDeleteExpense,
  onClearAll,
}: FinanceTabProps) {
  const [incomeModalOpen, setIncomeModalOpen] = useState(false);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [defaultExpenseType, setDefaultExpenseType] = useState<ExpenseType>('cost');
  const { toast } = useToast();
  const { t } = useLanguage();

  // Separate expenses by type
  const purchaseData = expenseData.filter(exp => exp.expenseType === 'purchase');
  const costData = expenseData.filter(exp => exp.expenseType === 'cost' || !exp.expenseType);

  const totalPurchase = purchaseData.reduce((sum, exp) => sum + exp.amount, 0);
  const totalCost = costData.reduce((sum, exp) => sum + exp.amount, 0);


  const handleIncomeSubmit = (income: Omit<Income, 'id'>) => {
    if (editingIncome) {
      onUpdateIncome(editingIncome.id, income);
      toast({ title: t('success'), description: t('income') + ' ' + t('update') });
    } else {
      onAddIncome(income);
      toast({ title: t('success'), description: t('income') + ' ' + t('add') });
    }
    setEditingIncome(null);
  };

  const handleExpenseSubmit = (expense: Omit<Expense, 'id'>) => {
    if (editingExpense) {
      onUpdateExpense(editingExpense.id, expense);
      toast({ title: t('success'), description: expense.expenseType === 'purchase' ? t('purchase') : t('cost') });
    } else {
      onAddExpense(expense);
      toast({ title: t('success'), description: expense.expenseType === 'purchase' ? t('purchase') : t('cost') });
    }
    setEditingExpense(null);
  };

  const openExpenseModal = (type: ExpenseType) => {
    setEditingExpense(null);
    setDefaultExpenseType(type);
    setExpenseModalOpen(true);
  };

  return (
    <div className="space-y-5 sm:space-y-6 md:space-y-8">
      {/* Summary Grid */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:gap-5">
        <SummaryCard title={t('cash')}         value={formatCurrency(summary.totalCash)}    variant="cash"     delay={0} />
        <SummaryCard title={t('card')}         value={formatCurrency(summary.totalCard)}    variant="card"     delay={60} />
        <SummaryCard title={t('totalSales')}   value={formatCurrency(summary.totalIncome)}  variant="income"   delay={120} />
        <SummaryCard title={t('totalExpense')} value={formatCurrency(summary.totalExpense)} variant="expense"  delay={180} />
        <SummaryCard title={t('purchase')}     value={formatCurrency(totalPurchase)}        variant="purchase" delay={240} />
        <SummaryCard title={t('cost')}         value={formatCurrency(totalCost)}            variant="cost"     delay={300} />
        <SummaryCard title={t('balance')}      value={formatCurrency(summary.balance)}      variant="balance"  delay={360} fullWidth />
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 md:gap-5 animate-fade-in" style={{ animationDelay: '100ms' }}>
        <button 
          onClick={() => { setEditingIncome(null); setIncomeModalOpen(true); }} 
          className="group relative overflow-hidden rounded-xl sm:rounded-2xl md:rounded-3xl bg-gradient-to-br from-primary via-primary to-emerald-500 p-3 sm:p-4 md:p-6 shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/40 hover:scale-[1.02] sm:hover:scale-[1.03] active:scale-[0.97] transition-all duration-300 touch-manipulation"
        >
          {/* Glow effect */}
          <div className="absolute -top-6 sm:-top-8 -right-6 sm:-right-8 w-16 sm:w-20 md:w-28 h-16 sm:h-20 md:h-28 rounded-full bg-white/20 blur-xl sm:blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black/20 to-transparent" />
          
          <div className="relative flex flex-col items-center gap-1.5 sm:gap-2 md:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 rounded-lg sm:rounded-xl md:rounded-2xl bg-white/25 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-lg">
              <Plus className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8 text-white" />
            </div>
            <div className="text-center">
              <span className="block font-bold text-white text-xs sm:text-sm md:text-lg">{t('income')}</span>
              <span className="block text-white/70 text-[8px] sm:text-[10px] md:text-xs mt-0.5">Income</span>
            </div>
          </div>
        </button>
        
        <button 
          onClick={() => openExpenseModal('purchase')} 
          className="group relative overflow-hidden rounded-xl sm:rounded-2xl md:rounded-3xl bg-gradient-to-br from-accent via-accent to-amber-400 p-3 sm:p-4 md:p-6 shadow-xl shadow-accent/25 hover:shadow-2xl hover:shadow-accent/40 hover:scale-[1.02] sm:hover:scale-[1.03] active:scale-[0.97] transition-all duration-300 touch-manipulation"
        >
          {/* Glow effect */}
          <div className="absolute -top-6 sm:-top-8 -right-6 sm:-right-8 w-16 sm:w-20 md:w-28 h-16 sm:h-20 md:h-28 rounded-full bg-white/20 blur-xl sm:blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black/20 to-transparent" />
          
          <div className="relative flex flex-col items-center gap-1.5 sm:gap-2 md:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 rounded-lg sm:rounded-xl md:rounded-2xl bg-white/25 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-lg">
              <ShoppingCart className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8 text-white" />
            </div>
            <div className="text-center">
              <span className="block font-bold text-white text-xs sm:text-sm md:text-lg">{t('purchase')}</span>
              <span className="block text-white/70 text-[8px] sm:text-[10px] md:text-xs mt-0.5">Purchase</span>
            </div>
          </div>
        </button>
        
        <button 
          onClick={() => openExpenseModal('cost')} 
          className="group relative overflow-hidden rounded-xl sm:rounded-2xl md:rounded-3xl bg-gradient-to-br from-destructive via-destructive to-rose-400 p-3 sm:p-4 md:p-6 shadow-xl shadow-destructive/25 hover:shadow-2xl hover:shadow-destructive/40 hover:scale-[1.02] sm:hover:scale-[1.03] active:scale-[0.97] transition-all duration-300 touch-manipulation"
        >
          {/* Glow effect */}
          <div className="absolute -top-6 sm:-top-8 -right-6 sm:-right-8 w-16 sm:w-20 md:w-28 h-16 sm:h-20 md:h-28 rounded-full bg-white/20 blur-xl sm:blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black/20 to-transparent" />
          
          <div className="relative flex flex-col items-center gap-1.5 sm:gap-2 md:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 rounded-lg sm:rounded-xl md:rounded-2xl bg-white/25 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-lg">
              <Receipt className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8 text-white" />
            </div>
            <div className="text-center">
              <span className="block font-bold text-white text-xs sm:text-sm md:text-lg">{t('cost')}</span>
              <span className="block text-white/70 text-[8px] sm:text-[10px] md:text-xs mt-0.5">Cost</span>
            </div>
          </div>
        </button>
      </div>


      {/* Income List */}
      <div className="glass-card p-4 md:p-6 animate-fade-in" style={{ animationDelay: '200ms' }}>
        <h3 className="text-base md:text-lg font-bold text-foreground mb-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-success to-emerald-400 flex items-center justify-center shadow-md shadow-success/30">
            <TrendingUp className="h-4 w-4 text-white" />
          </div>
          <div>
            <span className="block">{t('dailyIncomeTitle')}</span>
            <span className="text-xs font-normal text-muted-foreground">{incomeData.length} {t('records')}</span>
          </div>
        </h3>
        {incomeData.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-secondary/80 to-secondary/40 flex items-center justify-center mx-auto mb-3 shadow-inner">
              <TrendingUp className="h-8 w-8 opacity-40" />
            </div>
            <p className="text-sm font-medium">{t('noIncomeYet')}</p>
            <p className="text-xs text-muted-foreground/70 mt-1">{t('clickToAddIncome')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {incomeData.map((income, index) => {
              const dateStr = formatDate(income.day, currentMonthKey);
              return (
                <div
                  key={income.id}
                  className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-success/10 via-success/5 to-transparent border border-success/20 px-3 py-2.5 hover:border-success/40 hover:shadow-lg hover:shadow-success/10 active:scale-[0.99] transition-all duration-200"
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  {/* Top row: day badge + total + actions */}
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 flex-shrink-0 rounded-lg bg-gradient-to-br from-success/25 to-success/10 border border-success/20 flex items-center justify-center">
                      <span className="text-success font-bold text-xs font-mono leading-none">{income.day}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      {/* Cash + Card pills */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <div className="flex items-center gap-1 bg-success/10 px-1.5 py-0.5 rounded-md">
                          <Banknote className="h-2.5 w-2.5 text-success flex-shrink-0" />
                          <span className="text-success text-[11px] font-semibold font-mono">{formatCurrency(income.cash)}</span>
                        </div>
                        <div className="flex items-center gap-1 bg-info/10 px-1.5 py-0.5 rounded-md">
                          <CreditCard className="h-2.5 w-2.5 text-info flex-shrink-0" />
                          <span className="text-info text-[11px] font-semibold font-mono">{formatCurrency(income.card)}</span>
                        </div>
                      </div>
                    </div>
                    {/* Total */}
                    <div className="text-success font-bold text-sm font-mono flex-shrink-0">{formatCurrency(income.total)}</div>
                    {/* Actions */}
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => { setEditingIncome(income); setIncomeModalOpen(true); }}
                        className="p-1.5 rounded-lg bg-secondary/70 hover:bg-secondary text-muted-foreground hover:text-foreground transition-all duration-200 active:scale-95"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => { if (confirm(t('areYouSure'))) { onDeleteIncome(income.id); toast({ title: t('success'), description: t('incomeDeleted') }); } }}
                        className="p-1.5 rounded-lg bg-destructive/15 hover:bg-destructive/25 text-destructive transition-all duration-200 active:scale-95"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Purchase List */}
      <div className="glass-card p-4 md:p-6 animate-fade-in" style={{ animationDelay: '300ms' }}>
        <h3 className="text-base md:text-lg font-bold text-foreground mb-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-amber-400 flex items-center justify-center shadow-md shadow-accent/30">
            <ShoppingCart className="h-4 w-4 text-white" />
          </div>
          <div>
            <span className="block">{t('purchaseTitle')}</span>
            <span className="text-xs font-normal text-muted-foreground">{purchaseData.length} {t('records')}</span>
          </div>
        </h3>
        {purchaseData.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-secondary/80 to-secondary/40 flex items-center justify-center mx-auto mb-3 shadow-inner">
              <ShoppingCart className="h-8 w-8 opacity-40" />
            </div>
            <p className="text-sm font-medium">{t('noPurchaseYet')}</p>
            <p className="text-xs text-muted-foreground/70 mt-1">{t('clickToAddPurchase')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {purchaseData.map((expense, index) => {
              const dateStr = formatDate(expense.day, currentMonthKey);
              return (
                <div
                  key={expense.id}
                  className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-accent/10 via-accent/5 to-transparent border border-accent/20 px-3 py-2.5 hover:border-accent/40 hover:shadow-lg hover:shadow-accent/10 active:scale-[0.99] transition-all duration-200"
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  <div className="flex items-center gap-3">
                    {/* Day badge */}
                    <div className="w-9 h-9 flex-shrink-0 rounded-lg bg-gradient-to-br from-accent/25 to-accent/10 border border-accent/20 flex items-center justify-center">
                      <span className="text-accent font-bold text-sm font-mono leading-none">{expense.day}</span>
                    </div>

                    {/* Description */}
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground text-xs font-medium truncate">{expense.description}</p>
                      <p className="text-muted-foreground text-[10px] mt-0.5 font-mono">{dateStr}</p>
                    </div>

                    {/* Amount */}
                    <div className="text-accent font-bold text-sm font-mono flex-shrink-0">{formatCurrency(expense.amount)}</div>

                    {/* Actions */}
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => { setEditingExpense(expense); setDefaultExpenseType('purchase'); setExpenseModalOpen(true); }}
                        className="p-1.5 rounded-lg bg-secondary/70 hover:bg-secondary text-muted-foreground hover:text-foreground transition-all duration-200 active:scale-95"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => { if (confirm(t('areYouSure'))) { onDeleteExpense(expense.id); toast({ title: t('success'), description: t('purchaseDeleted') }); } }}
                        className="p-1.5 rounded-lg bg-destructive/15 hover:bg-destructive/25 text-destructive transition-all duration-200 active:scale-95"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cost List */}
      <div className="glass-card p-4 md:p-6 animate-fade-in" style={{ animationDelay: '400ms' }}>
        <h3 className="text-base md:text-lg font-bold text-foreground mb-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-destructive to-rose-400 flex items-center justify-center shadow-md shadow-destructive/30">
            <Receipt className="h-4 w-4 text-white" />
          </div>
          <div>
            <span className="block">{t('costTitle')}</span>
            <span className="text-xs font-normal text-muted-foreground">{costData.length} {t('records')}</span>
          </div>
        </h3>
        {costData.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-secondary/80 to-secondary/40 flex items-center justify-center mx-auto mb-3 shadow-inner">
              <Receipt className="h-8 w-8 opacity-40" />
            </div>
            <p className="text-sm font-medium">{t('noCostYet')}</p>
            <p className="text-xs text-muted-foreground/70 mt-1">{t('clickToAddCost')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {costData.map((expense, index) => {
              const dateStr = formatDate(expense.day, currentMonthKey);
              return (
                <div
                  key={expense.id}
                  className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-destructive/10 via-destructive/5 to-transparent border border-destructive/20 px-3 py-2.5 hover:border-destructive/40 hover:shadow-lg hover:shadow-destructive/10 active:scale-[0.99] transition-all duration-200"
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  <div className="flex items-center gap-3">
                    {/* Day badge */}
                    <div className="w-9 h-9 flex-shrink-0 rounded-lg bg-gradient-to-br from-destructive/25 to-destructive/10 border border-destructive/20 flex items-center justify-center">
                      <span className="text-destructive font-bold text-sm font-mono leading-none">{expense.day}</span>
                    </div>

                    {/* Description */}
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground text-xs font-medium truncate">{expense.description}</p>
                      <p className="text-muted-foreground text-[10px] mt-0.5 font-mono">{dateStr}</p>
                    </div>

                    {/* Amount */}
                    <div className="text-destructive font-bold text-sm font-mono flex-shrink-0">{formatCurrency(expense.amount)}</div>

                    {/* Actions */}
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => { setEditingExpense(expense); setDefaultExpenseType('cost'); setExpenseModalOpen(true); }}
                        className="p-1.5 rounded-lg bg-secondary/70 hover:bg-secondary text-muted-foreground hover:text-foreground transition-all duration-200 active:scale-95"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => { if (confirm(t('areYouSure'))) { onDeleteExpense(expense.id); toast({ title: t('success'), description: t('costDeleted') }); } }}
                        className="p-1.5 rounded-lg bg-destructive/15 hover:bg-destructive/25 text-destructive transition-all duration-200 active:scale-95"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      <IncomeModal
        isOpen={incomeModalOpen}
        onClose={() => { setIncomeModalOpen(false); setEditingIncome(null); }}
        onSubmit={handleIncomeSubmit}
        editingIncome={editingIncome}
        maxDays={maxDays}
        defaultDay={defaultDay}
        monthKey={currentMonthKey}
      />
      <ExpenseModal
        isOpen={expenseModalOpen}
        onClose={() => { setExpenseModalOpen(false); setEditingExpense(null); }}
        onSubmit={handleExpenseSubmit}
        editingExpense={editingExpense}
        maxDays={maxDays}
        defaultDay={defaultDay}
        defaultExpenseType={defaultExpenseType}
        monthKey={currentMonthKey}
      />
    </div>
  );
}
