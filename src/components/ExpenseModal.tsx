import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Modal } from './Modal';
import { Expense, ExpenseType, Location } from '@/types/finance';
import { FileText, ShoppingCart, Receipt, Calendar, MapPin } from 'lucide-react';
import { DayPicker } from './DayPicker';
import { useLanguage } from '@/contexts/LanguageContext';
import { CurrencyAmountRows, AmountRow, emptyRow } from './CurrencyAmountRows';
import { LocationSelect } from './LocationSelect';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (expense: Omit<Expense, 'id'>) => void;
  editingExpense?: Expense | null;
  maxDays: number;
  defaultDay: number;
  defaultExpenseType?: ExpenseType;
  monthKey: string;
  locations: Location[];
  onAddLocation: (name: string) => Promise<Location | null>;
}

export function ExpenseModal({ isOpen, onClose, onSubmit, editingExpense, maxDays, defaultDay, defaultExpenseType = 'cost', monthKey, locations, onAddLocation }: ExpenseModalProps) {
  const [day, setDay] = useState(defaultDay);
  const [rows, setRows] = useState<AmountRow[]>([emptyRow('GBP')]);
  const [description, setDescription] = useState('');
  const [expenseType, setExpenseType] = useState<ExpenseType>(defaultExpenseType);
  const [locationId, setLocationId] = useState<string | null>(null);
  const { t } = useLanguage();

  useEffect(() => {
    if (editingExpense) {
      setDay(editingExpense.day);
      setRows(
        editingExpense.amounts.length
          ? editingExpense.amounts.map((a) => ({ currency: a.currency, cash: '', card: '', amount: a.amount ? String(a.amount) : '' }))
          : [emptyRow('GBP')]
      );
      setDescription(editingExpense.description);
      setExpenseType(editingExpense.expenseType || 'cost');
      setLocationId(editingExpense.locationId || null);
    } else {
      setDay(defaultDay);
      setRows([emptyRow('GBP')]);
      setDescription('');
      setExpenseType(defaultExpenseType);
      setLocationId(null);
    }
  }, [editingExpense, defaultDay, defaultExpenseType]);

  const isPurchase = expenseType === 'purchase';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amounts = rows
      .map((r) => ({ currency: r.currency, amount: parseFloat(r.amount) || 0 }))
      .filter((a) => a.amount > 0);
    if (amounts.length === 0) {
      amounts.push({ currency: rows[0].currency, amount: 0 });
    }
    const gbp = amounts.find((a) => a.currency === 'GBP');
    onSubmit({ day, amounts, description, expenseType, locationId, amount: gbp?.amount || 0 });
    onClose();
  };

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
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Expense Type Toggle */}
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

        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs font-medium flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-primary" />
            {t('day')}
          </Label>
          <DayPicker value={day} onChange={setDay} maxDays={maxDays} monthKey={monthKey} />
        </div>

        <div className="space-y-1.5">
          <Label className={`text-xs font-medium ${isPurchase ? 'text-accent' : 'text-destructive'}`}>{t('currency')}</Label>
          <CurrencyAmountRows mode="expense" rows={rows} onChange={setRows} accentClass={isPurchase ? 'text-accent' : 'text-destructive'} />
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
            className="bg-secondary/50 border-white/10 rounded-xl focus:border-primary/50 focus:ring-2 focus:ring-primary/20 min-h-[64px] text-sm transition-all resize-none"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs font-medium flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-primary" /> {t('location')}
          </Label>
          <LocationSelect locations={locations} value={locationId} onChange={setLocationId} onAddLocation={onAddLocation} />
        </div>

        <Button
          type="submit"
          className={`w-full py-4 text-base font-bold rounded-xl shadow-lg active:scale-[0.98] transition-all ${
            isPurchase ? 'btn-gradient-accent shadow-accent/30' : 'btn-gradient-danger shadow-destructive/30'
          }`}
        >
          {editingExpense ? t('update') : t('add')}
        </Button>
      </form>
    </Modal>
  );
}
