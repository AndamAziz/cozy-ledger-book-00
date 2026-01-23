import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from './Modal';
import { Cigarette } from '@/types/finance';
import { useLanguage } from '@/contexts/LanguageContext';
import { Boxes, Hash, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EditStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (id: string | number, boxes: number, extraPacks: number) => void;
  cigarette: Cigarette | null;
}

export function EditStockModal({ isOpen, onClose, onSubmit, cigarette }: EditStockModalProps) {
  const [boxes, setBoxes] = useState<string>('');
  const [extraPacks, setExtraPacks] = useState<string>('');
  const { t } = useLanguage();

  useEffect(() => {
    if (cigarette) {
      setBoxes(cigarette.boxes.toString());
      setExtraPacks((cigarette.extraPacks || 0).toString());
    }
  }, [cigarette]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (cigarette) {
      onSubmit(cigarette.id, parseInt(boxes) || 0, parseInt(extraPacks) || 0);
      onClose();
    }
  };

  const boxesNum = parseInt(boxes) || 0;
  const packsNum = parseInt(extraPacks) || 0;
  const totalUnits = cigarette ? (boxesNum * cigarette.packsPerBox) + packsNum : 0;

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={t('editStock')}
      icon={<Settings className="w-5 h-5" />}
      variant="info"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Product Info Header */}
        {cigarette && (
          <div className="bg-secondary/30 rounded-xl p-4 mb-4">
            <h3 className="text-lg font-bold text-foreground mb-1">{cigarette.name}</h3>
            <p className="text-sm text-muted-foreground">
              {cigarette.packsPerBox} {t('unitsPerBox')}
            </p>
          </div>
        )}

        {/* Input Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground flex items-center gap-2">
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
            <Label className="text-muted-foreground flex items-center gap-2">
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

        {/* Total Units Preview */}
        <div className="bg-info/5 border border-info/20 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('totalUnits')}</span>
            <span className={cn(
              "text-2xl font-bold",
              totalUnits === 0 ? "text-muted-foreground" : "text-info"
            )}>
              {totalUnits === 0 ? '—' : totalUnits}
            </span>
          </div>
        </div>
        
        <Button type="submit" className="w-full btn-gradient-info py-6 text-lg">
          {t('update')}
        </Button>
      </form>
    </Modal>
  );
}
