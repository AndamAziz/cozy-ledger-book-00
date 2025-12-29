import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Modal } from './Modal';
import { Expense } from '@/types/finance';
import { Calendar, PoundSterling, FileText } from 'lucide-react';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (expense: Omit<Expense, 'id'>) => void;
  editingExpense?: Expense | null;
  maxDays: number;
  defaultDay: number;
}

export function ExpenseModal({ isOpen, onClose, onSubmit, editingExpense, maxDays, defaultDay }: ExpenseModalProps) {
  const [day, setDay] = useState(defaultDay);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (editingExpense) {
      setDay(editingExpense.day);
      setAmount(editingExpense.amount.toString());
      setDescription(editingExpense.description);
    } else {
      setDay(defaultDay);
      setAmount('');
      setDescription('');
    }
  }, [editingExpense, defaultDay]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ day, amount: parseFloat(amount) || 0, description });
    onClose();
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={editingExpense ? 'دەستکاری خەرجی' : 'زیادکردنی خەرجی'}
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
        
        <div className="space-y-2">
          <Label className="text-muted-foreground flex items-center gap-2">
            <PoundSterling className="h-4 w-4 text-destructive" />
            بڕی پارە £
          </Label>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="bg-secondary/30 border-border/50 focus:border-destructive/50 focus:ring-destructive/20 transition-all"
            required
          />
        </div>
        
        <div className="space-y-2">
          <Label className="text-muted-foreground flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            وەسف
          </Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="وەسفی خەرجی بنووسە"
            className="bg-secondary/30 border-border/50 focus:border-primary/50 focus:ring-primary/20 min-h-[100px] transition-all"
            required
          />
        </div>
        
        <Button type="submit" className="w-full btn-gradient-danger py-6 text-lg font-bold shadow-lg shadow-destructive/20 hover:shadow-destructive/40 transition-shadow">
          {editingExpense ? 'نوێکردنەوە' : 'زیادکردن'}
        </Button>
      </form>
    </Modal>
  );
}
