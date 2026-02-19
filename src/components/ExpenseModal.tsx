import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Modal } from './Modal';
import { Expense, ExpenseType } from '@/types/finance';
import { Calendar, PoundSterling, FileText, ShoppingCart, Receipt } from 'lucide-react';
import { DayPicker } from './DayPicker';
import { useLanguage } from '@/contexts/LanguageContext';
import { NumericInput } from './NumericInput';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (expense: Omit<Expense, 'id'>) => void;
  editingExpense?: Expense | null;
  maxDays: number;
  defaultDay: number;
  defaultExpenseType?: ExpenseType;
  monthKey: string;
}

export function ExpenseModal({ isOpen, onClose, onSubmit, editingExpense, maxDays, defaultDay, defaultExpenseType = 'cost', monthKey }: ExpenseModalProps) {
  const [day, setDay] = useState(defaultDay);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [expenseType, setExpenseType] = useState<ExpenseType>(defaultExpenseType);
  const { t } = useLanguage();

  useEffect(() => {
    if (editingExpense) {
      setDay(editingExpense.day);
      setAmount(editingExpense.amount.toString());
      setDescription(editingExpense.description);
      setExpenseType(editingExpense.expenseType || 'cost');
    } else {
      setDay(defaultDay);
      setAmount('');
      setDescription('');
      setExpenseType(defaultExpenseType);
    }
  }, [editingExpense, defaultDay, defaultExpenseType]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ day, amount: parseFloat(amount) || 0, description, expenseType });
    onClose();
  };

  const isPurchase = expenseType === 'purchase';
  const modalTitle = editingExpense 
    ? (isPurchase ? t('editPurchase') : t('editCost'))
    : (isPurchase ? t('addPurchase') : t('addCost'));

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={modalTitle}
      icon={isPurchase ? <ShoppingCart className="h-6 w-6 text-white" /> : <Receipt className="h-6 w-6 text-white" />}
      variant={isPurchase ? "accent" : "danger"}
    >
      <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-5">
        {/* Expense Type Toggle - compact horizontal pill style */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setExpenseType('purchase')}
            className={`py-2.5 px-3 rounded-xl border-2 transition-all duration-200 flex items-center justify-center gap-2 ${
              expenseType === 'purchase'
                ? 'border-accent bg-accent/20 text-accent'
                : 'border-white/10 bg-secondary/30 text-muted-foreground hover:border-white/20'
            }`}
          >
            <ShoppingCart className="h-4 w-4 shrink-0" />
            <span className="font-semibold text-xs sm:text-sm">{t('purchase')}</span>
          </button>
          <button
            type="button"
            onClick={() => setExpenseType('cost')}
            className={`py-2.5 px-3 rounded-xl border-2 transition-all duration-200 flex items-center justify-center gap-2 ${
              expenseType === 'cost'
                ? 'border-destructive bg-destructive/20 text-destructive'
                : 'border-white/10 bg-secondary/30 text-muted-foreground hover:border-white/20'
            }`}
          >
            <Receipt className="h-4 w-4 shrink-0" />
            <span className="font-semibold text-xs sm:text-sm">{t('cost')}</span>
          </button>
        </div>

        {/* Day + Amount side by side on mobile */}
        <div className="grid grid-cols-1 gap-3">
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs font-medium flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              {t('day')}
            </Label>
            <DayPicker
              value={day}
              onChange={setDay}
              maxDays={maxDays}
              monthKey={monthKey}
            />
          </div>

          <div className="space-y-1.5">
            <Label className={`text-xs font-medium flex items-center gap-1.5 ${isPurchase ? 'text-accent' : 'text-destructive'}`}>
              <PoundSterling className="h-3.5 w-3.5" />
              {t('amount')} £
            </Label>
            <NumericInput
              value={amount}
              onChange={setAmount}
              placeholder="0.00"
              className={isPurchase 
                ? 'focus:border-accent/50 focus:ring-2 focus:ring-accent/20' 
                : 'focus:border-destructive/50 focus:ring-2 focus:ring-destructive/20'
              }
              required
            />
          </div>
        </div>
        
        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs font-medium flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            {t('description')}
          </Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={isPurchase ? t('purchasePlaceholder') : t('costPlaceholder')}
            className="bg-secondary/50 border-white/10 rounded-xl focus:border-primary/50 focus:ring-2 focus:ring-primary/20 min-h-[64px] sm:min-h-[90px] text-sm transition-all resize-none"
            required
          />
        </div>
        
        <Button 
          type="submit" 
          className={`w-full py-4 sm:py-6 text-base font-bold rounded-xl shadow-lg active:scale-[0.98] transition-all ${
            isPurchase 
              ? 'btn-gradient-accent shadow-accent/30' 
              : 'btn-gradient-danger shadow-destructive/30'
          }`}
        >
          {editingExpense ? t('update') : t('add')}
        </Button>
      </form>
    </Modal>
  );
}
