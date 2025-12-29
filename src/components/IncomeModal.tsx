import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from './Modal';
import { Income } from '@/types/finance';
import { Calendar, Wallet, CreditCard } from 'lucide-react';

interface IncomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (income: Omit<Income, 'id'>) => void;
  editingIncome?: Income | null;
  maxDays: number;
  defaultDay: number;
}

export function IncomeModal({ isOpen, onClose, onSubmit, editingIncome, maxDays, defaultDay }: IncomeModalProps) {
  const [day, setDay] = useState(defaultDay);
  const [cash, setCash] = useState('');
  const [card, setCard] = useState('');

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
      title={editingIncome ? 'دەستکاری داهات' : 'زیادکردنی داهات'}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label className="text-muted-foreground flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            ڕۆژ
          </Label>
          <Input
            type="number"
            min={1}
            max={maxDays}
            value={day}
            onChange={(e) => setDay(parseInt(e.target.value) || 1)}
            className="bg-secondary/30 border-border/50 focus:border-primary/50 focus:ring-primary/20 transition-all"
            required
          />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground flex items-center gap-2">
              <Wallet className="h-4 w-4 text-success" />
              کاش £
            </Label>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={cash}
              onChange={(e) => setCash(e.target.value)}
              className="bg-secondary/30 border-border/50 focus:border-success/50 focus:ring-success/20 transition-all"
              required
            />
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-info" />
              کارت £
            </Label>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={card}
              onChange={(e) => setCard(e.target.value)}
              className="bg-secondary/30 border-border/50 focus:border-info/50 focus:ring-info/20 transition-all"
              required
            />
          </div>
        </div>
        
        <Button type="submit" className="w-full btn-gradient-primary py-6 text-lg font-bold shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-shadow">
          {editingIncome ? 'نوێکردنەوە' : 'زیادکردن'}
        </Button>
      </form>
    </Modal>
  );
}
