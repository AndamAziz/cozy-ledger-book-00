import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from './Modal';
import { Cigarette } from '@/types/finance';

interface EditStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (id: string | number, boxes: number, extraPacks: number) => void;
  cigarette: Cigarette | null;
}

export function EditStockModal({ isOpen, onClose, onSubmit, cigarette }: EditStockModalProps) {
  const [boxes, setBoxes] = useState(0);
  const [extraPacks, setExtraPacks] = useState(0);

  useEffect(() => {
    if (cigarette) {
      setBoxes(cigarette.boxes);
      setExtraPacks(cigarette.extraPacks || 0);
    }
  }, [cigarette]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (cigarette) {
      onSubmit(cigarette.id, boxes, extraPacks);
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="دەستکاری کۆگا">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label className="text-muted-foreground">ژمارەی بۆکس</Label>
          <Input
            type="number"
            min={0}
            value={boxes}
            onChange={(e) => setBoxes(parseInt(e.target.value) || 0)}
            className="bg-secondary/50 border-border"
            required
          />
        </div>
        
        <div className="space-y-2">
          <Label className="text-muted-foreground">ژمارەی پاکەت (جیا)</Label>
          <Input
            type="number"
            min={0}
            value={extraPacks}
            onChange={(e) => setExtraPacks(parseInt(e.target.value) || 0)}
            className="bg-secondary/50 border-border"
            required
          />
        </div>
        
        <Button type="submit" className="w-full btn-gradient-info py-6 text-lg">
          نوێکردنەوە
        </Button>
      </form>
    </Modal>
  );
}
