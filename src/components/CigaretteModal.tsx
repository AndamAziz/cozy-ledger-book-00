import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from './Modal';
import { Cigarette } from '@/types/finance';

interface CigaretteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (cigarette: Omit<Cigarette, 'id' | 'boxes' | 'extraPacks'>) => void;
  editingCigarette?: Cigarette | null;
}

export function CigaretteModal({ isOpen, onClose, onSubmit, editingCigarette }: CigaretteModalProps) {
  const [name, setName] = useState('');
  const [boxPrice, setBoxPrice] = useState(0);
  const [packsPerBox, setPacksPerBox] = useState(10);
  const [sellPrice, setSellPrice] = useState(0);
  const [alertLevel, setAlertLevel] = useState(20);

  useEffect(() => {
    if (editingCigarette) {
      setName(editingCigarette.name);
      setBoxPrice(editingCigarette.boxPrice);
      setPacksPerBox(editingCigarette.packsPerBox);
      setSellPrice(editingCigarette.sellPrice);
      setAlertLevel(editingCigarette.alertLevel);
    } else {
      setName('');
      setBoxPrice(0);
      setPacksPerBox(10);
      setSellPrice(0);
      setAlertLevel(20);
    }
  }, [editingCigarette]);

  const packPrice = useMemo(() => {
    return boxPrice / (packsPerBox || 1);
  }, [boxPrice, packsPerBox]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      boxPrice,
      packsPerBox,
      packPrice,
      sellPrice,
      alertLevel,
    });
    onClose();
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={editingCigarette ? 'دەستکاری جگەرە' : 'زیادکردنی جۆری جگەرە'}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label className="text-muted-foreground">ناوی جگەرە</Label>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="وەک: Marlboro Gold"
            className="bg-secondary/50 border-border"
            required
          />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground">نرخی بۆکس £</Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={boxPrice}
              onChange={(e) => setBoxPrice(parseFloat(e.target.value) || 0)}
              className="bg-secondary/50 border-border"
              required
            />
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground">پاکەت لە بۆکس</Label>
            <Input
              type="number"
              min={1}
              value={packsPerBox}
              onChange={(e) => setPacksPerBox(parseInt(e.target.value) || 10)}
              className="bg-secondary/50 border-border"
              required
            />
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground">نرخی فرۆشتن (پاکەت) £</Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={sellPrice}
              onChange={(e) => setSellPrice(parseFloat(e.target.value) || 0)}
              className="bg-secondary/50 border-border"
              required
            />
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground">ئاستی ئاگاداری (پاکەت)</Label>
            <Input
              type="number"
              min={0}
              value={alertLevel}
              onChange={(e) => setAlertLevel(parseInt(e.target.value) || 20)}
              className="bg-secondary/50 border-border"
              required
            />
          </div>
        </div>
        
        <div className="bg-info/10 p-4 rounded-xl">
          <Label className="text-info text-sm">نرخی پاکەت (ئۆتۆماتیک):</Label>
          <div className="text-2xl font-bold text-info mt-1">
            £{packPrice.toFixed(2)}
          </div>
        </div>
        
        <Button type="submit" className="w-full btn-gradient-accent py-6 text-lg">
          {editingCigarette ? 'نوێکردنەوە' : 'زیادکردن'}
        </Button>
      </form>
    </Modal>
  );
}
