import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Modal } from './Modal';
import { Cigarette } from '@/types/finance';

interface AddStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (cigaretteId: number, boxes: number) => void;
  cigarettes: Cigarette[];
}

export function AddStockModal({ isOpen, onClose, onSubmit, cigarettes }: AddStockModalProps) {
  const [selectedId, setSelectedId] = useState<string>('');
  const [boxes, setBoxes] = useState(1);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedId) {
      onSubmit(parseInt(selectedId), boxes);
      setSelectedId('');
      setBoxes(1);
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="زیادکردنی بۆکس بۆ کۆگا">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label className="text-muted-foreground">جۆری جگەرە</Label>
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="bg-secondary/50 border-border">
              <SelectValue placeholder="جگەرە هەڵبژێرە..." />
            </SelectTrigger>
            <SelectContent>
              {cigarettes.map((cig) => {
                const totalPacks = (cig.boxes * cig.packsPerBox) + (cig.extraPacks || 0);
                return (
                  <SelectItem key={cig.id} value={cig.id.toString()}>
                    {cig.name} ({totalPacks} پاکەت)
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label className="text-muted-foreground">ژمارەی بۆکس</Label>
          <Input
            type="number"
            min={1}
            value={boxes}
            onChange={(e) => setBoxes(parseInt(e.target.value) || 1)}
            placeholder="چەند بۆکس؟"
            className="bg-secondary/50 border-border"
            required
          />
        </div>
        
        <Button type="submit" className="w-full btn-gradient-info py-6 text-lg">
          زیادکردن
        </Button>
      </form>
    </Modal>
  );
}
