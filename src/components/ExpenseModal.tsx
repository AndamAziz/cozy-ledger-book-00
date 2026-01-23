import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Modal } from './Modal';
import { Expense, ExpenseType } from '@/types/finance';
import { Calendar, PoundSterling, FileText, ShoppingCart, Receipt } from 'lucide-react';
import { DayPicker } from './DayPicker';
import { useLanguage } from '@/contexts/LanguageContext';

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
      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        {/* Expense Type Toggle */}
        <div className="space-y-2 sm:space-y-3">
          <Label className="text-foreground font-medium flex items-center gap-2 text-sm sm:text-base">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-secondary/50 flex items-center justify-center">
              <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
            </div>
            {t('expenseType')}
          </Label>
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setExpenseType('purchase')}
              className={`p-3 sm:p-4 rounded-xl border-2 transition-all duration-200 flex flex-col items-center gap-1.5 sm:gap-2 ${
                expenseType === 'purchase'
                  ? 'border-accent bg-accent/20 text-accent'
                  : 'border-white/10 bg-secondary/30 text-muted-foreground hover:border-white/20'
              }`}
            >
              <ShoppingCart className="h-5 w-5 sm:h-6 sm:w-6" />
              <span className="font-semibold text-xs sm:text-sm">{t('purchase')}</span>
              <span className="text-[10px] sm:text-xs opacity-70 hidden sm:block">{t('purchaseDesc')}</span>
            </button>
            <button
              type="button"
              onClick={() => setExpenseType('cost')}
              className={`p-3 sm:p-4 rounded-xl border-2 transition-all duration-200 flex flex-col items-center gap-1.5 sm:gap-2 ${
                expenseType === 'cost'
                  ? 'border-destructive bg-destructive/20 text-destructive'
                  : 'border-white/10 bg-secondary/30 text-muted-foreground hover:border-white/20'
              }`}
            >
              <Receipt className="h-5 w-5 sm:h-6 sm:w-6" />
              <span className="font-semibold text-xs sm:text-sm">{t('cost')}</span>
              <span className="text-[10px] sm:text-xs opacity-70 hidden sm:block">{t('costDesc')}</span>
            </button>
          </div>
        </div>

        <div className="space-y-2 sm:space-y-3">
          <Label className="text-foreground font-medium flex items-center gap-2 text-sm sm:text-base">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
            </div>
            {t('day')}
          </Label>
          <DayPicker
            value={day}
            onChange={setDay}
            maxDays={maxDays}
            monthKey={monthKey}
          />
        </div>
        
        <div className="space-y-2 sm:space-y-3">
          <Label className="text-foreground font-medium flex items-center gap-2 text-sm sm:text-base">
            <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center ${isPurchase ? 'bg-accent/20' : 'bg-destructive/20'}`}>
              <PoundSterling className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${isPurchase ? 'text-accent' : 'text-destructive'}`} />
            </div>
            {t('amount')} £
          </Label>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`h-12 sm:h-14 text-base sm:text-lg bg-secondary/50 border-white/10 rounded-xl transition-all ${
              isPurchase 
                ? 'focus:border-accent/50 focus:ring-2 focus:ring-accent/20' 
                : 'focus:border-destructive/50 focus:ring-2 focus:ring-destructive/20'
            }`}
            required
          />
        </div>
        
        <div className="space-y-2 sm:space-y-3">
          <Label className="text-foreground font-medium flex items-center gap-2 text-sm sm:text-base">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-secondary/50 flex items-center justify-center">
              <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
            </div>
            {t('description')}
          </Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={isPurchase ? t('purchasePlaceholder') : t('costPlaceholder')}
            className="bg-secondary/50 border-white/10 rounded-xl focus:border-primary/50 focus:ring-2 focus:ring-primary/20 min-h-[70px] sm:min-h-[100px] text-sm sm:text-base transition-all resize-none"
            required
          />
        </div>
        
        <Button 
          type="submit" 
          className={`w-full py-5 sm:py-7 text-base sm:text-lg font-bold rounded-xl sm:rounded-2xl shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all ${
            isPurchase 
              ? 'btn-gradient-accent shadow-accent/30 hover:shadow-accent/50' 
              : 'btn-gradient-danger shadow-destructive/30 hover:shadow-destructive/50'
          }`}
        >
          {editingExpense ? t('update') : t('add')}
        </Button>
      </form>
    </Modal>
  );
}
