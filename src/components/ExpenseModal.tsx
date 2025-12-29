import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Modal } from './Modal';
import { Expense } from '@/types/finance';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (expense: Omit<Expense, 'id'>) => void;
  editingExpense?: Expense | null;
}

export function ExpenseModal({ isOpen, onClose, onSubmit, editingExpense }: ExpenseModalProps) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState(0);
  const [purpose, setPurpose] = useState('');

  useEffect(() => {
    if (editingExpense) {
      setName(editingExpense.name);
      setAmount(editingExpense.amount);
      setPurpose(editingExpense.purpose);
    } else {
      setName('');
      setAmount(0);
      setPurpose('');
    }
  }, [editingExpense]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name, amount, purpose });
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
          <Label className="text-muted-foreground">ناوی کۆمپانیا/کەس</Label>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ناو بنووسە"
            className="bg-secondary/50 border-border"
            required
          />
        </div>
        
        <div className="space-y-2">
          <Label className="text-muted-foreground">بڕی پارە £</Label>
          <Input
            type="number"
            min={0}
            step={0.01}
            value={amount}
            onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
            className="bg-secondary/50 border-border"
            required
          />
        </div>
        
        <div className="space-y-2">
          <Label className="text-muted-foreground">مەبەست</Label>
          <Textarea
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="مەبەست بنووسە"
            className="bg-secondary/50 border-border min-h-[100px]"
            required
          />
        </div>
        
        <Button type="submit" className="w-full btn-gradient-danger py-6 text-lg">
          {editingExpense ? 'نوێکردنەوە' : 'زیادکردن'}
        </Button>
      </form>
    </Modal>
  );
}
