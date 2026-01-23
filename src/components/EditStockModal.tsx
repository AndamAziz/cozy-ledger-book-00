import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from './Modal';
import { Cigarette, UnitType } from '@/types/finance';
import { useLanguage } from '@/contexts/LanguageContext';
import { Boxes, Hash, Settings, Box, Ruler, Scale, Droplets, Package } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EditStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (id: string | number, boxes: number, extraPacks: number) => void;
  cigarette: Cigarette | null;
}

const unitTypeIcons: Record<UnitType, React.ReactNode> = {
  box: <Box className="w-4 h-4" />,
  meter: <Ruler className="w-4 h-4" />,
  piece: <Hash className="w-4 h-4" />,
  kg: <Scale className="w-4 h-4" />,
  liter: <Droplets className="w-4 h-4" />,
  pack: <Package className="w-4 h-4" />,
};

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

  // Get dynamic labels based on unit type
  const getUnitLabels = (unitType: UnitType) => {
    switch (unitType) {
      case 'meter':
        return { 
          containerLabel: t('unitTypeMeter'),
          looseLabel: t('looseUnits'),
          unitName: t('unitTypeMeter')
        };
      case 'kg':
        return { 
          containerLabel: t('unitTypeKg'),
          looseLabel: t('looseUnits'),
          unitName: t('unitTypeKg')
        };
      case 'liter':
        return { 
          containerLabel: t('unitTypeLiter'),
          looseLabel: t('looseUnits'),
          unitName: t('unitTypeLiter')
        };
      case 'piece':
        return { 
          containerLabel: t('unitTypePiece'),
          looseLabel: t('looseUnits'),
          unitName: t('unitTypePiece')
        };
      case 'pack':
        return { 
          containerLabel: t('unitTypePack'),
          looseLabel: t('looseUnits'),
          unitName: t('unitTypePack')
        };
      default:
        return { 
          containerLabel: t('boxes'),
          looseLabel: t('looseUnits'),
          unitName: t('units')
        };
    }
  };

  const labels = cigarette 
    ? getUnitLabels(cigarette.unitType || 'box')
    : getUnitLabels('box');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (cigarette) {
      onSubmit(cigarette.id, parseFloat(boxes) || 0, parseFloat(extraPacks) || 0);
      onClose();
    }
  };

  const boxesNum = parseFloat(boxes) || 0;
  const packsNum = parseFloat(extraPacks) || 0;
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
            <h3 className="text-lg font-bold text-foreground mb-1 flex items-center gap-2">
              {unitTypeIcons[cigarette.unitType || 'box']}
              {cigarette.name}
            </h3>
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
              {labels.containerLabel}
            </Label>
            <Input
              type="number"
              min={0}
              step={0.01}
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
              {labels.looseLabel}
            </Label>
            <Input
              type="number"
              min={0}
              step={0.01}
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
              {totalUnits}
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
