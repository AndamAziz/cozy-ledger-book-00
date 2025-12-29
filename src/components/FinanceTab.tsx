import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SummaryCard } from './SummaryCard';
import { IncomeModal } from './IncomeModal';
import { ExpenseModal } from './ExpenseModal';
import { Income, Expense } from '@/types/finance';
import { formatCurrency } from '@/lib/format';
import { Plus, Minus, Printer, Trash2, Pencil } from 'lucide-react';
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
  onUpdateIncome: (id: number, income: Omit<Income, 'id'>) => void;
  onDeleteIncome: (id: number) => void;
  onAddExpense: (expense: Omit<Expense, 'id'>) => void;
  onUpdateExpense: (id: number, expense: Omit<Expense, 'id'>) => void;
  onDeleteExpense: (id: number) => void;
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

  const handleClearAll = () => {
    if (confirm('دڵنیایت لە سڕینەوەی هەموو داتاکان؟')) {
      onClearAll();
      toast({ title: 'سەرکەوتوو', description: 'هەموو داتاکان سڕانەوە' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Grid */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 animate-fade-in">
        <SummaryCard title="کاش" value={formatCurrency(summary.totalCash)} variant="income" icon="💵" />
        <SummaryCard title="کارت" value={formatCurrency(summary.totalCard)} variant="income" icon="💳" />
        <SummaryCard title="کۆی فرۆشتن" value={formatCurrency(summary.totalIncome)} variant="income" icon="📈" />
        <SummaryCard title="کۆی مەسرەف" value={formatCurrency(summary.totalExpense)} variant="expense" icon="📉" />
        <SummaryCard title="پارەی ماوە" value={formatCurrency(summary.balance)} variant="balance" icon="💰" fullWidth />
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-in" style={{ animationDelay: '100ms' }}>
        <Button 
          onClick={() => { setEditingIncome(null); setIncomeModalOpen(true); }} 
          className="btn-gradient-primary py-5 text-sm md:text-base rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:scale-[1.02] transition-all duration-300"
        >
          <Plus className="h-5 w-5 ml-2" />
          داهات
        </Button>
        <Button 
          onClick={() => { setEditingExpense(null); setExpenseModalOpen(true); }} 
          className="btn-gradient-danger py-5 text-sm md:text-base rounded-xl shadow-lg shadow-destructive/20 hover:shadow-destructive/40 hover:scale-[1.02] transition-all duration-300"
        >
          <Minus className="h-5 w-5 ml-2" />
          خەرجی
        </Button>
        <Button 
          onClick={() => window.print()} 
          variant="secondary" 
          className="py-5 text-sm md:text-base no-print rounded-xl hover:bg-secondary hover:scale-[1.02] transition-all duration-300"
        >
          <Printer className="h-5 w-5 ml-2" />
          چاپ
        </Button>
        <Button 
          onClick={handleClearAll} 
          variant="secondary" 
          className="py-5 text-sm md:text-base no-print rounded-xl hover:bg-destructive/10 hover:text-destructive hover:scale-[1.02] transition-all duration-300"
        >
          <Trash2 className="h-5 w-5 ml-2" />
          سڕینەوە
        </Button>
      </div>

      {/* Income List */}
      <div className="glass-card p-4 md:p-6 animate-fade-in" style={{ animationDelay: '200ms' }}>
        <h3 className="text-lg font-bold text-foreground mb-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-success/20 to-success/5 flex items-center justify-center">
            <span className="text-xl">📅</span>
          </div>
          داهاتی ڕۆژانە
        </h3>
        {incomeData.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="w-20 h-20 rounded-2xl bg-secondary/50 flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl opacity-50">📅</span>
            </div>
            <p className="text-sm">هیچ داهاتێک نییە</p>
          </div>
        ) : (
          <div className="space-y-3">
            {incomeData.map((income, index) => {
              // Parse month/year from currentMonthKey (format: YYYY-MM)
              const [year, month] = currentMonthKey.split('-');
              const dateStr = `${income.day.toString().padStart(2, '0')}-${month}-${year}`;
              
              return (
                <div 
                  key={income.id} 
                  className="group relative overflow-hidden rounded-xl bg-gradient-to-l from-success/5 to-transparent border border-success/10 p-3 md:p-4 hover:border-success/30 hover:shadow-lg hover:shadow-success/5 transition-all duration-300"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  {/* Mobile Layout */}
                  <div className="flex flex-col gap-3">
                    {/* Top Row: Date & Total */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-success/10 flex items-center justify-center text-success font-bold text-sm md:text-base font-mono">
                          {income.day}
                        </div>
                        <div>
                          <div className="font-bold text-foreground text-sm md:text-base font-mono tracking-wide">{dateStr}</div>
                          <div className="text-xs md:text-sm text-muted-foreground">ڕۆژی {income.day}</div>
                        </div>
                      </div>
                      <div className="text-success font-bold text-base md:text-lg">{formatCurrency(income.total)}</div>
                    </div>
                    
                    {/* Bottom Row: Cash/Card & Actions */}
                    <div className="flex items-center justify-between border-t border-border/30 pt-3">
                      <div className="flex gap-4 text-xs md:text-sm">
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground">💵</span>
                          <span className="text-foreground font-medium">{formatCurrency(income.cash)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground">💳</span>
                          <span className="text-foreground font-medium">{formatCurrency(income.card)}</span>
                        </div>
                      </div>
                      
                      {/* Action Buttons - Always Visible */}
                      <div className="flex gap-2">
                        <button 
                          onClick={() => { setEditingIncome(income); setIncomeModalOpen(true); }}
                          className="p-2 rounded-lg bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-105"
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
                          className="p-2 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive transition-all duration-200 hover:scale-105"
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
      <div className="glass-card p-4 md:p-6 animate-fade-in" style={{ animationDelay: '300ms' }}>
        <h3 className="text-lg font-bold text-foreground mb-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-destructive/20 to-destructive/5 flex items-center justify-center">
            <span className="text-xl">💸</span>
          </div>
          خەرجییەکان
        </h3>
        {expenseData.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="w-20 h-20 rounded-2xl bg-secondary/50 flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl opacity-50">💸</span>
            </div>
            <p className="text-sm">هیچ خەرجییەک نییە</p>
          </div>
        ) : (
          <div className="space-y-3">
            {expenseData.map((expense, index) => (
              <div 
                key={expense.id} 
                className="group relative overflow-hidden rounded-xl bg-gradient-to-l from-destructive/5 to-transparent border border-destructive/10 p-4 flex justify-between items-center gap-4 hover:border-destructive/30 hover:shadow-lg hover:shadow-destructive/5 transition-all duration-300"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center">
                    <Minus className="h-5 w-5 text-destructive" />
                  </div>
                  <div>
                    <div className="font-bold text-foreground">{expense.name}</div>
                    <div className="text-sm text-muted-foreground truncate max-w-[200px]">
                      {expense.purpose}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-destructive font-bold text-lg">{formatCurrency(expense.amount)}</div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => { setEditingExpense(expense); setExpenseModalOpen(true); }}
                      className="p-2 rounded-lg bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
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
                      className="p-2 rounded-lg bg-secondary/50 hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
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
      />
    </div>
  );
}
