import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Modal } from './Modal';
import { Cigarette, UnitType } from '@/types/finance';
import { useLanguage } from '@/contexts/LanguageContext';
import { Package, Ruler, Hash, Scale, Droplets, Box } from 'lucide-react';

interface CigaretteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (cigarette: Omit<Cigarette, 'id' | 'boxes' | 'extraPacks'>) => void;
  editingCigarette?: Cigarette | null;
}

const unitTypeIcons: Record<UnitType, React.ReactNode> = {
  box: <Box className="w-4 h-4" />,
  meter: <Ruler className="w-4 h-4" />,
  piece: <Hash className="w-4 h-4" />,
  kg: <Scale className="w-4 h-4" />,
  liter: <Droplets className="w-4 h-4" />,
  pack: <Package className="w-4 h-4" />,
};

export function CigaretteModal({ isOpen, onClose, onSubmit, editingCigarette }: CigaretteModalProps) {
  const [name, setName] = useState('');
  const [boxPrice, setBoxPrice] = useState<string>('');
  const [packsPerBox, setPacksPerBox] = useState<string>('1');
  const [sellPrice, setSellPrice] = useState<string>('');
  const [alertLevel, setAlertLevel] = useState<string>('20');
  const [unitType, setUnitType] = useState<UnitType>('box');
  const { t } = useLanguage();

  useEffect(() => {
    if (editingCigarette) {
      setName(editingCigarette.name);
      setBoxPrice(editingCigarette.boxPrice.toString());
      setPacksPerBox(editingCigarette.packsPerBox.toString());
      setSellPrice(editingCigarette.sellPrice.toString());
      setAlertLevel(editingCigarette.alertLevel.toString());
      setUnitType(editingCigarette.unitType || 'box');
    } else {
      setName('');
      setBoxPrice('');
      setPacksPerBox('1');
      setSellPrice('');
      setAlertLevel('20');
      setUnitType('box');
    }
  }, [editingCigarette]);

  const boxPriceNum = parseFloat(boxPrice) || 0;
  const packsPerBoxNum = parseFloat(packsPerBox) || 1;
  const sellPriceNum = parseFloat(sellPrice) || 0;
  const alertLevelNum = parseInt(alertLevel) || 20;

  const packPrice = useMemo(() => {
    return boxPriceNum / (packsPerBoxNum || 1);
  }, [boxPriceNum, packsPerBoxNum]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      boxPrice: boxPriceNum,
      packsPerBox: packsPerBoxNum,
      packPrice,
      sellPrice: sellPriceNum,
      alertLevel: alertLevelNum,
      unitType,
    });
    onClose();
  };

  // Get dynamic labels based on unit type
  const getUnitLabels = () => {
    switch (unitType) {
      case 'meter':
        return { 
          containerLabel: t('unitTypeMeter'), 
          containerPriceLabel: t('pricePerMeter'),
          unitsLabel: t('unitsPerContainer'),
          priceLabel: t('pricePerMeter')
        };
      case 'kg':
        return { 
          containerLabel: t('unitTypeKg'), 
          containerPriceLabel: t('pricePerKg'),
          unitsLabel: t('unitsPerContainer'),
          priceLabel: t('pricePerKg')
        };
      case 'liter':
        return { 
          containerLabel: t('unitTypeLiter'), 
          containerPriceLabel: t('pricePerLiter'),
          unitsLabel: t('unitsPerContainer'),
          priceLabel: t('pricePerLiter')
        };
      case 'piece':
        return { 
          containerLabel: t('unitTypePiece'), 
          containerPriceLabel: t('pricePerPiece'),
          unitsLabel: t('piecesPerContainer'),
          priceLabel: t('pricePerPiece')
        };
      case 'pack':
        return { 
          containerLabel: t('unitTypePack'), 
          containerPriceLabel: t('pricePerUnit'),
          unitsLabel: t('unitsPerPack'),
          priceLabel: t('pricePerUnit')
        };
      default:
        return { 
          containerLabel: t('unitTypeBox'), 
          containerPriceLabel: t('boxPrice'),
          unitsLabel: t('unitsPerBox'),
          priceLabel: t('unitPrice')
        };
    }
  };

  const labels = getUnitLabels();

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={editingCigarette ? t('editProduct') : t('addProduct')}
    >
      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
        {/* Product Name */}
        <div className="space-y-2">
          <Label className="text-muted-foreground text-sm sm:text-base">{t('name')}</Label>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('name')}
            className="bg-secondary/50 border-border h-12 sm:h-14 text-base"
            required
          />
        </div>

        {/* Unit Type Selection */}
        <div className="space-y-2">
          <Label className="text-muted-foreground text-sm sm:text-base">{t('unitType')}</Label>
          <Select value={unitType} onValueChange={(value: UnitType) => setUnitType(value)}>
            <SelectTrigger className="bg-secondary/50 border-border h-12 sm:h-14">
              <SelectValue placeholder={t('selectUnitType')} />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              <SelectItem value="box">
                <span className="flex items-center gap-2">
                  {unitTypeIcons.box}
                  <span>{t('unitTypeBox')}</span>
                </span>
              </SelectItem>
              <SelectItem value="piece">
                <span className="flex items-center gap-2">
                  {unitTypeIcons.piece}
                  <span>{t('unitTypePiece')}</span>
                </span>
              </SelectItem>
              <SelectItem value="pack">
                <span className="flex items-center gap-2">
                  {unitTypeIcons.pack}
                  <span>{t('unitTypePack')}</span>
                </span>
              </SelectItem>
              <SelectItem value="meter">
                <span className="flex items-center gap-2">
                  {unitTypeIcons.meter}
                  <span>{t('unitTypeMeter')}</span>
                </span>
              </SelectItem>
              <SelectItem value="kg">
                <span className="flex items-center gap-2">
                  {unitTypeIcons.kg}
                  <span>{t('unitTypeKg')}</span>
                </span>
              </SelectItem>
              <SelectItem value="liter">
                <span className="flex items-center gap-2">
                  {unitTypeIcons.liter}
                  <span>{t('unitTypeLiter')}</span>
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        {/* Pricing Grid */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs sm:text-sm">{labels.containerPriceLabel} £</Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={boxPrice}
              onChange={(e) => setBoxPrice(e.target.value)}
              placeholder="0"
              className="bg-secondary/50 border-border h-12 sm:h-14 text-base"
              required
            />
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs sm:text-sm">{labels.unitsLabel}</Label>
            <Input
              type="number"
              min={0.01}
              step={0.01}
              value={packsPerBox}
              onChange={(e) => setPacksPerBox(e.target.value)}
              placeholder="1"
              className="bg-secondary/50 border-border h-12 sm:h-14 text-base"
              required
            />
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs sm:text-sm">{t('sellPrice')} £</Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value)}
              placeholder="0"
              className="bg-secondary/50 border-border h-12 sm:h-14 text-base"
              required
            />
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs sm:text-sm">{t('alertLevel')}</Label>
            <Input
              type="number"
              min={0}
              value={alertLevel}
              onChange={(e) => setAlertLevel(e.target.value)}
              placeholder="20"
              className="bg-secondary/50 border-border h-12 sm:h-14 text-base"
              required
            />
          </div>
        </div>
        
        {/* Calculated Unit Price */}
        <div className="bg-info/10 p-3 sm:p-4 rounded-xl">
          <Label className="text-info text-xs sm:text-sm">{labels.priceLabel}:</Label>
          <div className="text-xl sm:text-2xl font-bold text-info mt-1">
            £{packPrice.toFixed(2)}
          </div>
        </div>
        
        <Button type="submit" className="w-full btn-gradient-accent py-5 sm:py-6 text-base sm:text-lg rounded-xl sm:rounded-2xl">
          {editingCigarette ? t('update') : t('add')}
        </Button>
      </form>
    </Modal>
  );
}
