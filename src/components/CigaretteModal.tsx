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
  const [boxPrice, setBoxPrice] = useState(0);
  const [packsPerBox, setPacksPerBox] = useState(1);
  const [sellPrice, setSellPrice] = useState(0);
  const [alertLevel, setAlertLevel] = useState(20);
  const [unitType, setUnitType] = useState<UnitType>('box');
  const { t } = useLanguage();

  useEffect(() => {
    if (editingCigarette) {
      setName(editingCigarette.name);
      setBoxPrice(editingCigarette.boxPrice);
      setPacksPerBox(editingCigarette.packsPerBox);
      setSellPrice(editingCigarette.sellPrice);
      setAlertLevel(editingCigarette.alertLevel);
      setUnitType(editingCigarette.unitType || 'box');
    } else {
      setName('');
      setBoxPrice(0);
      setPacksPerBox(1);
      setSellPrice(0);
      setAlertLevel(20);
      setUnitType('box');
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
          unitsLabel: t('unitsPerContainer'),
          priceLabel: t('pricePerMeter')
        };
      case 'kg':
        return { 
          containerLabel: t('unitTypeKg'), 
          unitsLabel: t('unitsPerContainer'),
          priceLabel: t('pricePerKg')
        };
      case 'liter':
        return { 
          containerLabel: t('unitTypeLiter'), 
          unitsLabel: t('unitsPerContainer'),
          priceLabel: t('pricePerLiter')
        };
      case 'piece':
        return { 
          containerLabel: t('unitTypePiece'), 
          unitsLabel: t('piecesPerContainer'),
          priceLabel: t('pricePerPiece')
        };
      case 'pack':
        return { 
          containerLabel: t('unitTypePack'), 
          unitsLabel: t('unitsPerPack'),
          priceLabel: t('pricePerUnit')
        };
      default:
        return { 
          containerLabel: t('unitTypeBox'), 
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
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Product Name */}
        <div className="space-y-2">
          <Label className="text-muted-foreground">{t('name')}</Label>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('name')}
            className="bg-secondary/50 border-border"
            required
          />
        </div>

        {/* Unit Type Selection */}
        <div className="space-y-2">
          <Label className="text-muted-foreground">{t('unitType')}</Label>
          <Select value={unitType} onValueChange={(value: UnitType) => setUnitType(value)}>
            <SelectTrigger className="bg-secondary/50 border-border h-12">
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
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground">{t('boxPrice')} £</Label>
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
            <Label className="text-muted-foreground">{labels.unitsLabel}</Label>
            <Input
              type="number"
              min={0.01}
              step={0.01}
              value={packsPerBox}
              onChange={(e) => setPacksPerBox(parseFloat(e.target.value) || 1)}
              className="bg-secondary/50 border-border"
              required
            />
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground">{t('sellPrice')} £</Label>
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
            <Label className="text-muted-foreground">{t('alertLevel')}</Label>
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
        
        {/* Calculated Unit Price */}
        <div className="bg-info/10 p-4 rounded-xl">
          <Label className="text-info text-sm">{labels.priceLabel}:</Label>
          <div className="text-2xl font-bold text-info mt-1">
            £{packPrice.toFixed(2)}
          </div>
        </div>
        
        <Button type="submit" className="w-full btn-gradient-accent py-6 text-lg">
          {editingCigarette ? t('update') : t('add')}
        </Button>
      </form>
    </Modal>
  );
}
