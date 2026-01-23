import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Modal } from './Modal';
import { Cigarette } from '@/types/finance';
import { Package, Boxes, Hash } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

interface AddStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (cigaretteId: string | number, boxes: number, extraPacks: number) => void;
  cigarettes: Cigarette[];
}

export function AddStockModal({ isOpen, onClose, onSubmit, cigarettes }: AddStockModalProps) {
  const [selectedId, setSelectedId] = useState<string>('');
  const [boxes, setBoxes] = useState<string>('');
  const [extraPacks, setExtraPacks] = useState<string>('');
  const { t } = useLanguage();

  const selectedProduct = cigarettes.find(c => c.id.toString() === selectedId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const boxesNum = parseInt(boxes) || 0;
    const packsNum = parseInt(extraPacks) || 0;
    if (selectedId && (boxesNum > 0 || packsNum > 0)) {
      onSubmit(selectedId, boxesNum, packsNum);
      setSelectedId('');
      setBoxes('');
      setExtraPacks('');
      onClose();
    }
  };

  const boxesNum = parseInt(boxes) || 0;
  const packsNum = parseInt(extraPacks) || 0;
  const isValid = selectedId && (boxesNum > 0 || packsNum > 0);

  // Calculate preview of units being added
  const unitsFromBoxes = selectedProduct ? boxesNum * selectedProduct.packsPerBox : 0;
  const totalUnitsAdding = unitsFromBoxes + packsNum;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('addStock')} icon={<Package className="w-5 h-5" />} variant="info">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Product Selection */}
        <div className="space-y-2">
          <Label className="text-muted-foreground text-base">{t('selectProduct')}</Label>
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="bg-secondary/50 border-border h-14 text-lg">
              <SelectValue placeholder={t('selectProductPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {cigarettes.map((cig) => {
                const totalPacks = (cig.boxes * cig.packsPerBox) + (cig.extraPacks || 0);
                return (
                  <SelectItem key={cig.id} value={cig.id.toString()}>
                    <span className="flex items-center gap-2">
                      <span>{cig.name}</span>
                      <span className="text-muted-foreground text-sm">({totalPacks} {t('units')})</span>
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Show product info when selected */}
        {selectedProduct && (
          <div className="bg-info/5 border border-info/20 rounded-xl p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('unitsPerBox')}:</span>
              <span className="font-semibold text-info">{selectedProduct.packsPerBox}</span>
            </div>
          </div>
        )}
        
        {/* Input Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground text-base flex items-center gap-2">
              <Boxes className="w-4 h-4" />
              {t('boxes')}
            </Label>
            <Input
              type="number"
              min={0}
              value={boxes}
              onChange={(e) => setBoxes(e.target.value)}
              placeholder="0"
              className={cn(
                "bg-secondary/50 border-border h-14 text-lg text-center",
                boxesNum > 0 && "border-info/50 bg-info/5"
              )}
            />
          </div>
          
          <div className="space-y-2">
            <Label className="text-muted-foreground text-base flex items-center gap-2">
              <Hash className="w-4 h-4" />
              {t('looseUnits')}
            </Label>
            <Input
              type="number"
              min={0}
              value={extraPacks}
              onChange={(e) => setExtraPacks(e.target.value)}
              placeholder="0"
              className={cn(
                "bg-secondary/50 border-border h-14 text-lg text-center",
                packsNum > 0 && "border-success/50 bg-success/5"
              )}
            />
          </div>
        </div>

        {/* Preview of what will be added */}
        {isValid && (
          <div className="bg-success/5 border border-success/20 rounded-xl p-4">
            <p className="text-sm text-success font-medium mb-2">{t('willBeAdded')}:</p>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('totalUnits')}</span>
              <span className="text-2xl font-bold text-success">+{totalUnitsAdding}</span>
            </div>
          </div>
        )}
        
        <Button 
          type="submit" 
          className="w-full btn-gradient-info py-6 text-lg" 
          disabled={!isValid}
        >
          {t('addStock')}
        </Button>
      </form>
    </Modal>
  );
}
