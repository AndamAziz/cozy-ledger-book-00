import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from './Modal';
import { Income } from '@/types/finance';

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
  const [cash, setCash] = useState(0);
  const [card, setCard] = useState(0);

  useEffect(() => {
    if (editingIncome) {
      setDay(editingIncome.day);
      setCash(editingIncome.cash);
      setCard(editingIncome.card);
    } else {
      setDay(defaultDay);
      setCash(0);
      setCard(0);
    }
  }, [editingIncome, defaultDay]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      day,
      cash,
      card,
      total: cash + card,
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
          <Label className="text-muted-foreground">ڕۆژ</Label>
          <Input
            type="number"
            min={1}
            max={maxDays}
            value={day}
            onChange={(e) => setDay(parseInt(e.target.value) || 1)}
            className="bg-secondary/50 border-border"
            required
          />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground">کاش £</Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={cash}
              onChange={(e) => setCash(parseFloat(e.target.value) || 0)}
              className="bg-secondary/50 border-border"
              required
            />
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground">کارت £</Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={card}
              onChange={(e) => setCard(parseFloat(e.target.value) || 0)}
              className="bg-secondary/50 border-border"
              required
            />
          </div>
        </div>
        
        <Button type="submit" className="w-full btn-gradient-primary py-6 text-lg">
          {editingIncome ? 'نوێکردنەوە' : 'زیادکردن'}
        </Button>
      </form>
    </Modal>
  );
}
