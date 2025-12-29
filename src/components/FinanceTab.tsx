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
    <div className="fade-in space-y-6">
      {/* Summary Grid */}
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <SummaryCard title="کاش" value={formatCurrency(summary.totalCash)} variant="income" icon="💵" />
        <SummaryCard title="کارت" value={formatCurrency(summary.totalCard)} variant="income" icon="💳" />
        <SummaryCard title="کۆی فرۆشتن" value={formatCurrency(summary.totalIncome)} variant="income" icon="📈" />
        <SummaryCard title="کۆی مەسرەف" value={formatCurrency(summary.totalExpense)} variant="expense" icon="📉" />
        <SummaryCard title="پارەی ماوە" value={formatCurrency(summary.balance)} variant="balance" icon="💰" fullWidth />
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Button 
          onClick={() => { setEditingIncome(null); setIncomeModalOpen(true); }} 
          className="btn-gradient-primary py-4 text-sm md:text-base"
        >
          <Plus className="h-4 w-4 ml-2" />
          داهات
        </Button>
        <Button 
          onClick={() => { setEditingExpense(null); setExpenseModalOpen(true); }} 
          className="btn-gradient-danger py-4 text-sm md:text-base"
        >
          <Minus className="h-4 w-4 ml-2" />
          خەرجی
        </Button>
        <Button 
          onClick={() => window.print()} 
          variant="secondary" 
          className="py-4 text-sm md:text-base no-print"
        >
          <Printer className="h-4 w-4 ml-2" />
          چاپ
        </Button>
        <Button 
          onClick={handleClearAll} 
          variant="secondary" 
          className="py-4 text-sm md:text-base no-print"
        >
          <Trash2 className="h-4 w-4 ml-2" />
          سڕینەوە
        </Button>
      </div>

      {/* Income List */}
      <div className="glass-card p-4 md:p-5">
        <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
          <span>📅</span> داهاتی ڕۆژانە
        </h3>
        {incomeData.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <div className="text-4xl mb-3">📅</div>
            <p>هیچ داهاتێک نییە</p>
          </div>
        ) : (
          <div className="space-y-3">
            {incomeData.map((income) => (
              <div key={income.id} className="report-item">
                <div>
                  <div className="font-bold text-foreground">ڕۆژی {income.day}</div>
                  <div className="text-sm text-muted-foreground">
                    کاش: {formatCurrency(income.cash)} | کارت: {formatCurrency(income.card)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-success font-bold">{formatCurrency(income.total)}</div>
                  <button 
                    onClick={() => { setEditingIncome(income); setIncomeModalOpen(true); }}
                    className="p-2 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground"
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

      {/* Expense List */}
      <div className="glass-card p-4 md:p-5">
        <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
          <span>💸</span> خەرجییەکان
        </h3>
        {expenseData.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <div className="text-4xl mb-3">💸</div>
            <p>هیچ خەرجییەک نییە</p>
          </div>
        ) : (
          <div className="space-y-3">
            {expenseData.map((expense) => (
              <div key={expense.id} className="report-item">
                <div>
                  <div className="font-bold text-foreground">{expense.name}</div>
                  <div className="text-sm text-muted-foreground truncate max-w-[200px]">
                    {expense.purpose}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-destructive font-bold">{formatCurrency(expense.amount)}</div>
                  <button 
                    onClick={() => { setEditingExpense(expense); setExpenseModalOpen(true); }}
                    className="p-2 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground"
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
