import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from './Modal';
import { Income } from '@/types/finance';
import { Calendar, Wallet, CreditCard } from 'lucide-react';
import { DayPicker } from './DayPicker';
import { useLanguage } from '@/contexts/LanguageContext';

interface IncomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (income: Omit<Income, 'id'>) => void;
  editingIncome?: Income | null;
  maxDays: number;
  defaultDay: number;
  monthKey: string;
}

export function IncomeModal({ isOpen, onClose, onSubmit, editingIncome, maxDays, defaultDay, monthKey }: IncomeModalProps) {
  const [day, setDay] = useState(defaultDay);
  const [cash, setCash] = useState('');
  const [card, setCard] = useState('');
  const { t } = useLanguage();

  useEffect(() => {
    if (editingIncome) {
      setDay(editingIncome.day);
      setCash(editingIncome.cash.toString());
      setCard(editingIncome.card.toString());
    } else {
      setDay(defaultDay);
      setCash('');
      setCard('');
    }
  }, [editingIncome, defaultDay]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cashValue = parseFloat(cash) || 0;
    const cardValue = parseFloat(card) || 0;
    onSubmit({
      day,
      cash: cashValue,
      card: cardValue,
      total: cashValue + cardValue,
    });
    onClose();
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={editingIncome ? t('editIncome') : t('addIncome')}
      icon={<Wallet className="h-6 w-6 text-white" />}
      variant="primary"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-3">
          <Label className="text-foreground font-medium flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <Calendar className="h-4 w-4 text-primary" />
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
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <Label className="text-foreground font-medium flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-success/20 flex items-center justify-center">
                <Wallet className="h-4 w-4 text-success" />
              </div>
              {t('cash')} £
            </Label>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={cash}
              onChange={(e) => setCash(e.target.value)}
              className="h-14 text-lg bg-secondary/50 border-white/10 rounded-xl focus:border-success/50 focus:ring-2 focus:ring-success/20 transition-all"
              required
            />
          </div>
          <div className="space-y-3">
            <Label className="text-foreground font-medium flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-info/20 flex items-center justify-center">
                <CreditCard className="h-4 w-4 text-info" />
              </div>
              {t('card')} £
            </Label>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={card}
              onChange={(e) => setCard(e.target.value)}
              className="h-14 text-lg bg-secondary/50 border-white/10 rounded-xl focus:border-info/50 focus:ring-2 focus:ring-info/20 transition-all"
              required
            />
          </div>
        </div>
        
        <Button type="submit" className="w-full btn-gradient-primary py-7 text-lg font-bold rounded-2xl shadow-xl shadow-primary/30 hover:shadow-primary/50 hover:scale-[1.02] active:scale-[0.98] transition-all">
          {editingIncome ? t('update') : t('add')}
        </Button>
      </form>
    </Modal>
  );
}
