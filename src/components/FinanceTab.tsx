import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SummaryCard } from './SummaryCard';
import { IncomeModal } from './IncomeModal';
import { ExpenseModal } from './ExpenseModal';
import { Income, Expense, ExpenseType } from '@/types/finance';
import { formatCurrency, formatDate } from '@/lib/format';
import { Plus, Minus, Pencil, Trash2, ShoppingCart, Receipt } from 'lucide-react';
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
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:gap-5 animate-fade-in">
        <SummaryCard title={t('cash')} value={formatCurrency(summary.totalCash)} variant="income" icon="💵" />
        <SummaryCard title={t('card')} value={formatCurrency(summary.totalCard)} variant="income" icon="💳" />
        <SummaryCard title={t('totalSales')} value={formatCurrency(summary.totalIncome)} variant="income" icon="📈" />
        <SummaryCard title={t('totalExpense')} value={formatCurrency(summary.totalExpense)} variant="expense" icon="📉" />
        <SummaryCard title={t('purchase')} value={formatCurrency(totalPurchase)} variant="accent" icon="🛒" />
        <SummaryCard title={t('cost')} value={formatCurrency(totalCost)} variant="expense" icon="🧾" />
        <SummaryCard title={t('balance')} value={formatCurrency(summary.balance)} variant="balance" icon="💰" fullWidth />
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


      <div className="glass-card p-5 md:p-7 animate-fade-in" style={{ animationDelay: '200ms' }}>
        <h3 className="text-lg md:text-xl font-bold text-foreground mb-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-success to-emerald-400 flex items-center justify-center shadow-lg shadow-success/30">
            <span className="text-2xl">📅</span>
          </div>
          <div>
            <span className="block">{t('dailyIncomeTitle')}</span>
            <span className="text-sm font-normal text-muted-foreground">{incomeData.length} {t('records')}</span>
          </div>
        </h3>
        {incomeData.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-secondary/80 to-secondary/40 flex items-center justify-center mx-auto mb-5 shadow-inner">
              <span className="text-5xl opacity-60">📅</span>
            </div>
            <p className="text-base font-medium">{t('noIncomeYet')}</p>
            <p className="text-sm text-muted-foreground/70 mt-2">{t('clickToAddIncome')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {incomeData.map((income, index) => {
              const dateStr = formatDate(income.day, currentMonthKey);
              
              return (
                <div 
                  key={income.id} 
                  className="group relative overflow-hidden rounded-2xl bg-gradient-to-l from-success/10 via-success/5 to-transparent border border-success/20 p-4 md:p-5 hover:border-success/40 hover:shadow-xl hover:shadow-success/10 hover:scale-[1.01] active:scale-[0.99] transition-all duration-300"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  {/* Glow effect */}
                  <div className="absolute -top-10 -right-10 w-24 h-24 rounded-full bg-success/20 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  
                  <div className="relative flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-gradient-to-br from-success/30 to-success/10 border border-success/20 flex items-center justify-center text-success font-bold text-lg md:text-xl font-mono shadow-inner">
                          {income.day}
                        </div>
                        <div>
                          <div className="font-bold text-foreground text-base md:text-lg font-mono tracking-wide">{dateStr}</div>
                        </div>
                      </div>
                      <div className="text-success font-bold text-lg md:text-2xl">{formatCurrency(income.total)}</div>
                    </div>
                    
                    <div className="flex items-center justify-between border-t border-border/40 pt-4">
                      <div className="flex gap-5 text-sm md:text-base">
                        <div className="flex items-center gap-2 bg-success/10 px-3 py-1.5 rounded-xl">
                          <span className="text-lg">💵</span>
                          <span className="text-foreground font-semibold">{formatCurrency(income.cash)}</span>
                        </div>
                        <div className="flex items-center gap-2 bg-info/10 px-3 py-1.5 rounded-xl">
                          <span className="text-lg">💳</span>
                          <span className="text-foreground font-semibold">{formatCurrency(income.card)}</span>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <button 
                          onClick={() => { setEditingIncome(income); setIncomeModalOpen(true); }}
                          className="p-2.5 rounded-xl bg-secondary/70 hover:bg-secondary text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-110 active:scale-95"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={() => {
                            if (confirm(t('areYouSure'))) {
                              onDeleteIncome(income.id);
                              toast({ title: t('success'), description: t('incomeDeleted') });
                            }
                          }}
                          className="p-2.5 rounded-xl bg-destructive/15 hover:bg-destructive/25 text-destructive transition-all duration-200 hover:scale-110 active:scale-95"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Purchase List */}
      <div className="glass-card p-5 md:p-7 animate-fade-in" style={{ animationDelay: '300ms' }}>
        <h3 className="text-lg md:text-xl font-bold text-foreground mb-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent to-amber-400 flex items-center justify-center shadow-lg shadow-accent/30">
            <ShoppingCart className="h-6 w-6 text-white" />
          </div>
          <div>
            <span className="block">{t('purchaseTitle')}</span>
            <span className="text-sm font-normal text-muted-foreground">{purchaseData.length} {t('records')}</span>
          </div>
        </h3>
        {purchaseData.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-secondary/80 to-secondary/40 flex items-center justify-center mx-auto mb-5 shadow-inner">
              <ShoppingCart className="h-12 w-12 opacity-60" />
            </div>
            <p className="text-base font-medium">{t('noPurchaseYet')}</p>
            <p className="text-sm text-muted-foreground/70 mt-2">{t('clickToAddPurchase')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {purchaseData.map((expense, index) => {
              const dateStr = formatDate(expense.day, currentMonthKey);
              
              return (
                <div 
                  key={expense.id} 
                  className="group relative overflow-hidden rounded-2xl bg-gradient-to-l from-accent/10 via-accent/5 to-transparent border border-accent/20 p-4 md:p-5 hover:border-accent/40 hover:shadow-xl hover:shadow-accent/10 hover:scale-[1.01] active:scale-[0.99] transition-all duration-300"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="absolute -top-10 -right-10 w-24 h-24 rounded-full bg-accent/20 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  
                  <div className="relative flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-gradient-to-br from-accent/30 to-accent/10 border border-accent/20 flex items-center justify-center text-accent font-bold text-lg md:text-xl font-mono shadow-inner">
                          {expense.day}
                        </div>
                        <div>
                          <div className="font-bold text-foreground text-base md:text-lg font-mono tracking-wide">{dateStr}</div>
                          <div className="text-sm text-muted-foreground truncate max-w-[200px] md:max-w-[300px]">
                            {expense.description}
                          </div>
                        </div>
                      </div>
                      <div className="text-accent font-bold text-lg md:text-2xl">{formatCurrency(expense.amount)}</div>
                    </div>
                    
                    <div className="flex items-center justify-end border-t border-border/40 pt-4">
                      <div className="flex gap-2">
                        <button 
                          onClick={() => { setEditingExpense(expense); setDefaultExpenseType('purchase'); setExpenseModalOpen(true); }}
                          className="p-2.5 rounded-xl bg-secondary/70 hover:bg-secondary text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-110 active:scale-95"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={() => {
                            if (confirm(t('areYouSure'))) {
                              onDeleteExpense(expense.id);
                              toast({ title: t('success'), description: t('purchaseDeleted') });
                            }
                          }}
                          className="p-2.5 rounded-xl bg-destructive/15 hover:bg-destructive/25 text-destructive transition-all duration-200 hover:scale-110 active:scale-95"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cost List */}
      <div className="glass-card p-5 md:p-7 animate-fade-in" style={{ animationDelay: '400ms' }}>
        <h3 className="text-lg md:text-xl font-bold text-foreground mb-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-destructive to-rose-400 flex items-center justify-center shadow-lg shadow-destructive/30">
            <Receipt className="h-6 w-6 text-white" />
          </div>
          <div>
            <span className="block">{t('costTitle')}</span>
            <span className="text-sm font-normal text-muted-foreground">{costData.length} {t('records')}</span>
          </div>
        </h3>
        {costData.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-secondary/80 to-secondary/40 flex items-center justify-center mx-auto mb-5 shadow-inner">
              <Receipt className="h-12 w-12 opacity-60" />
            </div>
            <p className="text-base font-medium">{t('noCostYet')}</p>
            <p className="text-sm text-muted-foreground/70 mt-2">{t('clickToAddCost')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {costData.map((expense, index) => {
              const dateStr = formatDate(expense.day, currentMonthKey);
              
              return (
                <div 
                  key={expense.id} 
                  className="group relative overflow-hidden rounded-2xl bg-gradient-to-l from-destructive/10 via-destructive/5 to-transparent border border-destructive/20 p-4 md:p-5 hover:border-destructive/40 hover:shadow-xl hover:shadow-destructive/10 hover:scale-[1.01] active:scale-[0.99] transition-all duration-300"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="absolute -top-10 -right-10 w-24 h-24 rounded-full bg-destructive/20 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  
                  <div className="relative flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-gradient-to-br from-destructive/30 to-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive font-bold text-lg md:text-xl font-mono shadow-inner">
                          {expense.day}
                        </div>
                        <div>
                          <div className="font-bold text-foreground text-base md:text-lg font-mono tracking-wide">{dateStr}</div>
                          <div className="text-sm text-muted-foreground truncate max-w-[200px] md:max-w-[300px]">
                            {expense.description}
                          </div>
                        </div>
                      </div>
                      <div className="text-destructive font-bold text-lg md:text-2xl">{formatCurrency(expense.amount)}</div>
                    </div>
                    
                    <div className="flex items-center justify-end border-t border-border/40 pt-4">
                      <div className="flex gap-2">
                        <button 
                          onClick={() => { setEditingExpense(expense); setDefaultExpenseType('cost'); setExpenseModalOpen(true); }}
                          className="p-2.5 rounded-xl bg-secondary/70 hover:bg-secondary text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-110 active:scale-95"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={() => {
                            if (confirm(t('areYouSure'))) {
                              onDeleteExpense(expense.id);
                              toast({ title: t('success'), description: t('costDeleted') });
                            }
                          }}
                          className="p-2.5 rounded-xl bg-destructive/15 hover:bg-destructive/25 text-destructive transition-all duration-200 hover:scale-110 active:scale-95"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
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
