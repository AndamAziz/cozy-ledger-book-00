import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Modal } from './Modal';
import { Cigarette } from '@/types/finance';
import { Package } from 'lucide-react';

interface AddStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (cigaretteId: string | number, boxes: number, extraPacks: number) => void;
  cigarettes: Cigarette[];
}

export function AddStockModal({ isOpen, onClose, onSubmit, cigarettes }: AddStockModalProps) {
  const [selectedId, setSelectedId] = useState<string>('');
  const [boxes, setBoxes] = useState(0);
  const [extraPacks, setExtraPacks] = useState(0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedId && (boxes > 0 || extraPacks > 0)) {
      onSubmit(selectedId, boxes, extraPacks);
      setSelectedId('');
      setBoxes(0);
      setExtraPacks(0);
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="زیادکردنی کۆگا" icon={<Package className="w-5 h-5" />} variant="info">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label className="text-muted-foreground text-base">جۆری جگەرە</Label>
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="bg-secondary/50 border-border h-14 text-lg">
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
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground text-base">ژمارەی بۆکس</Label>
            <Input
              type="number"
              min={0}
              value={boxes}
              onChange={(e) => setBoxes(parseInt(e.target.value) || 0)}
              placeholder="بۆکس"
              className="bg-secondary/50 border-border h-14 text-lg text-center"
            />
          </div>
          
          <div className="space-y-2">
            <Label className="text-muted-foreground text-base">ژمارەی پاکەت</Label>
            <Input
              type="number"
              min={0}
              value={extraPacks}
              onChange={(e) => setExtraPacks(parseInt(e.target.value) || 0)}
              placeholder="پاکەت"
              className="bg-secondary/50 border-border h-14 text-lg text-center"
            />
          </div>
        </div>
        
        <Button type="submit" className="w-full btn-gradient-info py-6 text-lg" disabled={!selectedId || (boxes === 0 && extraPacks === 0)}>
          زیادکردن
        </Button>
      </form>
    </Modal>
  );
}
