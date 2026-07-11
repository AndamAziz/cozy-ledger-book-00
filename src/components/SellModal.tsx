import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Modal } from './Modal';
import { Cigarette, Sale, UnitType, Currency, Location } from '@/types/finance';
import { formatCurrency } from '@/lib/format';
import { CURRENCIES, CURRENCY_LABELS } from '@/lib/currency';
import { useLanguage } from '@/contexts/LanguageContext';
import { Box, Ruler, Hash, Scale, Droplets, Package, Coins, MapPin } from 'lucide-react';
import { DayPicker } from './DayPicker';
import { NumericInput } from './NumericInput';
import { LocationSelect } from './LocationSelect';

interface SellModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (sale: Omit<Sale, 'id'>, cigaretteId: string | number) => void;
  cigarettes: Cigarette[];
  maxDays: number;
  defaultDay: number;
  monthKey: string;
  locations: Location[];
  onAddLocation: (name: string) => Promise<Location | null>;
}

const unitTypeIcons: Record<UnitType, React.ReactNode> = {
  box: <Box className="w-4 h-4" />,
  meter: <Ruler className="w-4 h-4" />,
  piece: <Hash className="w-4 h-4" />,
  kg: <Scale className="w-4 h-4" />,
  liter: <Droplets className="w-4 h-4" />,
  pack: <Package className="w-4 h-4" />,
};

export function SellModal({ isOpen, onClose, onSubmit, cigarettes, maxDays, defaultDay, monthKey, locations, onAddLocation }: SellModalProps) {
  const [day, setDay] = useState(defaultDay);
  const [selectedId, setSelectedId] = useState<string>('');
  const [packs, setPacks] = useState<string>('1');
  const [packPrice, setPackPrice] = useState<string>('');
  const [currency, setCurrency] = useState<Currency>('GBP');
  const [locationId, setLocationId] = useState<string | null>(null);
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
        currency,
        locationId,
      }, selectedCigarette.id);

      setSelectedId('');
      setPacks('1');
      setPackPrice('');
      setCurrency('GBP');
      setLocationId(null);
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('recordSale')}>
      <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">

        {/* Day + Product side by side */}
        <div className="grid grid-cols-1 gap-3">
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs font-medium flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 text-primary">📅</span>
              {t('day')}
            </Label>
            <DayPicker
              value={day}
              onChange={setDay}
              maxDays={maxDays}
              monthKey={monthKey}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs font-medium">{t('productType')}</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="bg-secondary/50 border-border h-11 sm:h-13 text-sm">
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
                        <span className="text-muted-foreground text-xs">({totalPacks} {unitLabel})</span>
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Selected product stock badge */}
        {selectedCigarette && (
          <div className="bg-info/8 border border-info/20 rounded-lg px-3 py-2 flex items-center justify-between">
            <span className="text-muted-foreground text-xs flex items-center gap-1.5">
              {unitTypeIcons[selectedCigarette.unitType || 'box']}
              {t(`unitType${(selectedCigarette.unitType || 'box').charAt(0).toUpperCase() + (selectedCigarette.unitType || 'box').slice(1)}` as any)}
            </span>
            <span className="font-bold text-info text-sm">
              {((selectedCigarette.boxes * selectedCigarette.packsPerBox) + (selectedCigarette.extraPacks || 0))} {labels.unitName}
            </span>
          </div>
        )}
        
        {/* Quantity + Price */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs font-medium">{labels.quantityLabel}</Label>
            <NumericInput
              value={packs}
              onChange={setPacks}
              placeholder="1"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs font-medium">{labels.priceLabel} £</Label>
            <NumericInput
              value={packPrice}
              onChange={setPackPrice}
              placeholder="0"
              required
            />
          </div>
        </div>

        {/* Currency + Location */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs font-medium flex items-center gap-1.5">
              <Coins className="h-3.5 w-3.5 text-primary" /> {t('currency')}
            </Label>
            <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
              <SelectTrigger className="bg-secondary/50 border-border h-11 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>{CURRENCY_LABELS[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs font-medium flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-primary" /> {t('location')}
            </Label>
            <LocationSelect locations={locations} value={locationId} onChange={setLocationId} onAddLocation={onAddLocation} />
          </div>
        </div>

        {/* Total */}
        <div className="bg-success/10 border border-success/20 px-4 py-3 rounded-xl flex items-center justify-between">
          <Label className="text-success text-xs font-medium">{t('total')}</Label>
          <div className="text-2xl font-bold text-success">
            {formatCurrency(total)}
          </div>
        </div>

        
        <Button type="submit" className="w-full btn-gradient-primary py-4 sm:py-5 text-base font-bold rounded-xl">
          {t('recordSale')}
        </Button>
      </form>
    </Modal>
  );
}