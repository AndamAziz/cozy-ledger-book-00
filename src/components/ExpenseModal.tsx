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
      icon={<PoundSterling className="h-6 w-6 text-white" />}
      variant="danger"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-3">
          <Label className="text-foreground font-medium flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <Calendar className="h-4 w-4 text-primary" />
            </div>
            ڕۆژ
          </Label>
          <Input
            type="number"
            min={1}
            max={maxDays}
            value={day}
            onChange={(e) => setDay(parseInt(e.target.value) || 1)}
            className="h-14 text-lg bg-secondary/50 border-white/10 rounded-xl focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all"
            required
          />
        </div>
        
        <div className="space-y-3">
          <Label className="text-foreground font-medium flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-destructive/20 flex items-center justify-center">
              <PoundSterling className="h-4 w-4 text-destructive" />
            </div>
            بڕی پارە £
          </Label>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-14 text-lg bg-secondary/50 border-white/10 rounded-xl focus:border-destructive/50 focus:ring-2 focus:ring-destructive/20 transition-all"
            required
          />
        </div>
        
        <div className="space-y-3">
          <Label className="text-foreground font-medium flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-secondary/50 flex items-center justify-center">
              <FileText className="h-4 w-4 text-muted-foreground" />
            </div>
            وەسف
          </Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="وەسفی خەرجی بنووسە"
            className="bg-secondary/50 border-white/10 rounded-xl focus:border-primary/50 focus:ring-2 focus:ring-primary/20 min-h-[120px] text-base transition-all resize-none"
            required
          />
        </div>
        
        <Button type="submit" className="w-full btn-gradient-danger py-7 text-lg font-bold rounded-2xl shadow-xl shadow-destructive/30 hover:shadow-destructive/50 hover:scale-[1.02] active:scale-[0.98] transition-all">
          {editingExpense ? 'نوێکردنەوە' : 'زیادکردن'}
        </Button>
      </form>
    </Modal>
  );
}
