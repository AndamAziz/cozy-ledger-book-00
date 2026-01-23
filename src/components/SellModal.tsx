import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Modal } from './Modal';
import { Cigarette, Sale, UnitType } from '@/types/finance';
import { formatCurrency } from '@/lib/format';
import { useLanguage } from '@/contexts/LanguageContext';
import { Box, Ruler, Hash, Scale, Droplets, Package } from 'lucide-react';
import { DayPicker } from './DayPicker';

interface SellModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (sale: Omit<Sale, 'id'>, cigaretteId: string | number) => void;
  cigarettes: Cigarette[];
  maxDays: number;
  defaultDay: number;
  monthKey: string;
}

const unitTypeIcons: Record<UnitType, React.ReactNode> = {
  box: <Box className="w-4 h-4" />,
  meter: <Ruler className="w-4 h-4" />,
  piece: <Hash className="w-4 h-4" />,
  kg: <Scale className="w-4 h-4" />,
  liter: <Droplets className="w-4 h-4" />,
  pack: <Package className="w-4 h-4" />,
};

export function SellModal({ isOpen, onClose, onSubmit, cigarettes, maxDays, defaultDay, monthKey }: SellModalProps) {
  const [day, setDay] = useState(defaultDay);
  const [selectedId, setSelectedId] = useState<string>('');
  const [packs, setPacks] = useState<string>('1');
  const [packPrice, setPackPrice] = useState<string>('');
  const { t } = useLanguage();

  const selectedCigarette = useMemo(() => {
    return cigarettes.find(c => c.id.toString() === selectedId);
  }, [selectedId, cigarettes]);

  useEffect(() => {
    if (selectedCigarette) {
      setPackPrice(selectedCigarette.sellPrice.toString());
    }
  }, [selectedCigarette]);

  useEffect(() => {
    setDay(defaultDay);
  }, [defaultDay]);

  const packsNum = parseFloat(packs) || 0;
  const packPriceNum = parseFloat(packPrice) || 0;
  const total = useMemo(() => packsNum * packPriceNum, [packsNum, packPriceNum]);

  // Get dynamic labels based on unit type
  const getUnitLabels = (unitType: UnitType) => {
    switch (unitType) {
      case 'meter':
        return { 
          quantityLabel: t('unitTypeMeter'),
          priceLabel: t('pricePerMeter'),
          unitName: t('unitTypeMeter')
        };
      case 'kg':
        return { 
          quantityLabel: t('unitTypeKg'),
          priceLabel: t('pricePerKg'),
          unitName: t('unitTypeKg')
        };
      case 'liter':
        return { 
          quantityLabel: t('unitTypeLiter'),
          priceLabel: t('pricePerLiter'),
          unitName: t('unitTypeLiter')
        };
      case 'piece':
        return { 
          quantityLabel: t('unitTypePiece'),
          priceLabel: t('pricePerPiece'),
          unitName: t('unitTypePiece')
        };
      case 'pack':
        return { 
          quantityLabel: t('unitTypePack'),
          priceLabel: t('pricePerUnit'),
          unitName: t('unitTypePack')
        };
      default:
        return { 
          quantityLabel: t('unitsCount'),
          priceLabel: t('unitPrice'),
          unitName: t('units')
        };
    }
  };

  const labels = selectedCigarette 
    ? getUnitLabels(selectedCigarette.unitType || 'box')
    : getUnitLabels('box');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedCigarette) {
      const totalAvailable = (selectedCigarette.boxes * selectedCigarette.packsPerBox) + (selectedCigarette.extraPacks || 0);
      if (packsNum > totalAvailable) {
        alert(`${t('low')}! ${t('only')} ${totalAvailable} ${labels.unitName}.`);
        return;
      }

      onSubmit({
        day,
        cigaretteId: selectedCigarette.id,
        cigaretteName: selectedCigarette.name,
        packs: packsNum,
        packPrice: packPriceNum,
        totalSale: total,
        profit: total - (packsNum * selectedCigarette.packPrice),
      }, selectedCigarette.id);

      setSelectedId('');
      setPacks('1');
      setPackPrice('');
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('recordSale')}>
      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
        <div className="space-y-2">
          <Label className="text-muted-foreground text-sm sm:text-base">{t('day')}</Label>
          <DayPicker
            value={day}
            onChange={setDay}
            maxDays={maxDays}
            monthKey={monthKey}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-muted-foreground text-sm sm:text-base">{t('productType')}</Label>
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="bg-secondary/50 border-border h-12 sm:h-14">
              <SelectValue placeholder={t('selectProduct')} />
            </SelectTrigger>
            <SelectContent>
              {cigarettes.map((cig) => {
                const totalPacks = (cig.boxes * cig.packsPerBox) + (cig.extraPacks || 0);
                const unitType = cig.unitType || 'box';
                const unitLabel = getUnitLabels(unitType).unitName;
                return (
                  <SelectItem key={cig.id} value={cig.id.toString()}>
                    <span className="flex items-center gap-2">
                      {unitTypeIcons[unitType]}
                      <span>{cig.name}</span>
                      <span className="text-muted-foreground text-sm">({totalPacks} {unitLabel})</span>
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Show selected product info */}
        {selectedCigarette && (
          <div className="bg-info/5 border border-info/20 rounded-xl p-2.5 sm:p-3">
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="text-muted-foreground flex items-center gap-2">
                {unitTypeIcons[selectedCigarette.unitType || 'box']}
                {t(`unitType${(selectedCigarette.unitType || 'box').charAt(0).toUpperCase() + (selectedCigarette.unitType || 'box').slice(1)}` as any)}
              </span>
              <span className="font-semibold text-info">
                {((selectedCigarette.boxes * selectedCigarette.packsPerBox) + (selectedCigarette.extraPacks || 0))} {labels.unitName}
              </span>
            </div>
          </div>
        )}
        
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs sm:text-sm">{labels.quantityLabel}</Label>
            <Input
              type="number"
              min={0.01}
              step={0.01}
              value={packs}
              onChange={(e) => setPacks(e.target.value)}
              placeholder="1"
              className="bg-secondary/50 border-border h-12 sm:h-14 text-base"
              required
            />
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs sm:text-sm">{labels.priceLabel} £</Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={packPrice}
              onChange={(e) => setPackPrice(e.target.value)}
              placeholder="0"
              className="bg-secondary/50 border-border h-12 sm:h-14 text-base"
              required
            />
          </div>
        </div>
        
        <div className="bg-success/10 p-4 sm:p-5 rounded-xl text-center">
          <Label className="text-success text-xs sm:text-sm">{t('total')}</Label>
          <div className="text-2xl sm:text-3xl font-bold text-success mt-1">
            {formatCurrency(total)}
          </div>
        </div>
        
        <Button type="submit" className="w-full btn-gradient-primary py-5 sm:py-6 text-base sm:text-lg rounded-xl sm:rounded-2xl">
          {t('recordSale')}
        </Button>
      </form>
    </Modal>
  );
}