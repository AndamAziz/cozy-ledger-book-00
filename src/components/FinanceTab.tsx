import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SummaryCard } from './SummaryCard';
import { IncomeModal } from './IncomeModal';
import { ExpenseModal } from './ExpenseModal';
import { Income, Expense } from '@/types/finance';
import { formatCurrency } from '@/lib/format';
import { Plus, Minus, Pencil, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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
  const { toast } = useToast();

  const handleIncomeSubmit = (income: Omit<Income, 'id'>) => {
    if (editingIncome) {
      onUpdateIncome(editingIncome.id, income);
      toast({ title: 'سەرکەوتوو', description: 'داهات نوێکرایەوە' });
    } else {
      onAddIncome(income);
      toast({ title: 'سەرکەوتوو', description: 'داهات زیادکرا' });
    }
    setEditingIncome(null);
  };

  const handleExpenseSubmit = (expense: Omit<Expense, 'id'>) => {
    if (editingExpense) {
      onUpdateExpense(editingExpense.id, expense);
      toast({ title: 'سەرکەوتوو', description: 'خەرجی نوێکرایەوە' });
    } else {
      onAddExpense(expense);
      toast({ title: 'سەرکەوتوو', description: 'خەرجی زیادکرا' });
    }
    setEditingExpense(null);
  };

  return (
    <div className="space-y-8">
      {/* Summary Grid */}
      <div className="grid grid-cols-2 gap-4 md:gap-5 animate-fade-in">
        <SummaryCard title="کاش" value={formatCurrency(summary.totalCash)} variant="income" icon="💵" />
        <SummaryCard title="کارت" value={formatCurrency(summary.totalCard)} variant="income" icon="💳" />
        <SummaryCard title="کۆی فرۆشتن" value={formatCurrency(summary.totalIncome)} variant="income" icon="📈" />
        <SummaryCard title="کۆی مەسرەف" value={formatCurrency(summary.totalExpense)} variant="expense" icon="📉" />
        <SummaryCard title="پارەی ماوە" value={formatCurrency(summary.balance)} variant="balance" icon="💰" fullWidth />
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-4 animate-fade-in" style={{ animationDelay: '100ms' }}>
        <Button 
          onClick={() => { setEditingIncome(null); setIncomeModalOpen(true); }} 
          className="group btn-gradient-primary py-6 text-base md:text-lg rounded-2xl shadow-xl shadow-primary/30 hover:shadow-primary/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Plus className="h-5 w-5" />
            </div>
            <span className="font-bold">داهات</span>
          </div>
        </Button>
        <Button 
          onClick={() => { setEditingExpense(null); setExpenseModalOpen(true); }} 
          className="group btn-gradient-danger py-6 text-base md:text-lg rounded-2xl shadow-xl shadow-destructive/30 hover:shadow-destructive/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Minus className="h-5 w-5" />
            </div>
            <span className="font-bold">خەرجی</span>
          </div>
        </Button>
      </div>

      {/* Income List */}
      <div className="glass-card p-5 md:p-7 animate-fade-in" style={{ animationDelay: '200ms' }}>
        <h3 className="text-lg md:text-xl font-bold text-foreground mb-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-success to-emerald-400 flex items-center justify-center shadow-lg shadow-success/30">
            <span className="text-2xl">📅</span>
          </div>
          <div>
            <span className="block">داهاتی ڕۆژانە</span>
            <span className="text-sm font-normal text-muted-foreground">{incomeData.length} تۆمار</span>
          </div>
        </h3>
        {incomeData.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-secondary/80 to-secondary/40 flex items-center justify-center mx-auto mb-5 shadow-inner">
              <span className="text-5xl opacity-60">📅</span>
            </div>
            <p className="text-base font-medium">هیچ داهاتێک نییە</p>
            <p className="text-sm text-muted-foreground/70 mt-2">کلیک لەسەر "داهات" بۆ زیادکردن</p>
          </div>
        ) : (
          <div className="space-y-4">
            {incomeData.map((income, index) => {
              const [year, month] = currentMonthKey.split('-');
              const dateStr = `${income.day.toString().padStart(2, '0')}-${month}-${year}`;
              
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
                          <div className="text-sm text-muted-foreground">ڕۆژی {income.day}</div>
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
                            if (confirm('دڵنیایت؟')) {
                              onDeleteIncome(income.id);
                              toast({ title: 'سەرکەوتوو', description: 'داهات سڕایەوە' });
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

      {/* Expense List */}
      <div className="glass-card p-5 md:p-7 animate-fade-in" style={{ animationDelay: '300ms' }}>
        <h3 className="text-lg md:text-xl font-bold text-foreground mb-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-destructive to-rose-400 flex items-center justify-center shadow-lg shadow-destructive/30">
            <span className="text-2xl">💸</span>
          </div>
          <div>
            <span className="block">خەرجییەکان</span>
            <span className="text-sm font-normal text-muted-foreground">{expenseData.length} تۆمار</span>
          </div>
        </h3>
        {expenseData.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-secondary/80 to-secondary/40 flex items-center justify-center mx-auto mb-5 shadow-inner">
              <span className="text-5xl opacity-60">💸</span>
            </div>
            <p className="text-base font-medium">هیچ خەرجییەک نییە</p>
            <p className="text-sm text-muted-foreground/70 mt-2">کلیک لەسەر "خەرجی" بۆ زیادکردن</p>
          </div>
        ) : (
          <div className="space-y-4">
            {expenseData.map((expense, index) => {
              const [year, month] = currentMonthKey.split('-');
              const dateStr = `${expense.day.toString().padStart(2, '0')}-${month}-${year}`;
              
              return (
                <div 
                  key={expense.id} 
                  className="group relative overflow-hidden rounded-2xl bg-gradient-to-l from-destructive/10 via-destructive/5 to-transparent border border-destructive/20 p-4 md:p-5 hover:border-destructive/40 hover:shadow-xl hover:shadow-destructive/10 hover:scale-[1.01] active:scale-[0.99] transition-all duration-300"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  {/* Glow effect */}
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
                          onClick={() => { setEditingExpense(expense); setExpenseModalOpen(true); }}
                          className="p-2.5 rounded-xl bg-secondary/70 hover:bg-secondary text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-110 active:scale-95"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={() => {
                            if (confirm('دڵنیایت؟')) {
                              onDeleteExpense(expense.id);
                              toast({ title: 'سەرکەوتوو', description: 'خەرجی سڕایەوە' });
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
      />
      <ExpenseModal
        isOpen={expenseModalOpen}
        onClose={() => { setExpenseModalOpen(false); setEditingExpense(null); }}
        onSubmit={handleExpenseSubmit}
        editingExpense={editingExpense}
        maxDays={maxDays}
        defaultDay={defaultDay}
      />
    </div>
  );
}
