import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Modal } from './Modal';
import { Cigarette, Sale } from '@/types/finance';
import { formatCurrency } from '@/lib/format';
import { useLanguage } from '@/contexts/LanguageContext';

interface SellModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (sale: Omit<Sale, 'id'>, cigaretteId: string | number) => void;
  cigarettes: Cigarette[];
  maxDays: number;
  defaultDay: number;
}

export function SellModal({ isOpen, onClose, onSubmit, cigarettes, maxDays, defaultDay }: SellModalProps) {
  const [day, setDay] = useState(defaultDay);
  const [selectedId, setSelectedId] = useState<string>('');
  const [packs, setPacks] = useState(1);
  const [packPrice, setPackPrice] = useState(0);
  const { t } = useLanguage();

  const selectedCigarette = useMemo(() => {
    return cigarettes.find(c => c.id.toString() === selectedId);
  }, [selectedId, cigarettes]);

  useEffect(() => {
    if (selectedCigarette) {
      setPackPrice(selectedCigarette.sellPrice);
    }
  }, [selectedCigarette]);

  useEffect(() => {
    setDay(defaultDay);
  }, [defaultDay]);

  const total = useMemo(() => packs * packPrice, [packs, packPrice]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedCigarette) {
      const totalAvailable = (selectedCigarette.boxes * selectedCigarette.packsPerBox) + (selectedCigarette.extraPacks || 0);
      if (packs > totalAvailable) {
        alert(`${t('low')}! ${t('only')} ${totalAvailable} ${t('packs')}.`);
        return;
      }

      onSubmit({
        day,
        cigaretteId: selectedCigarette.id,
        cigaretteName: selectedCigarette.name,
        packs,
        packPrice,
        totalSale: total,
        profit: total - (packs * selectedCigarette.packPrice),
      }, selectedCigarette.id);

      setSelectedId('');
      setPacks(1);
      setPackPrice(0);
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('recordSale')}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label className="text-muted-foreground">{t('day')}</Label>
          <Input
            type="number"
            min={1}
            max={maxDays}
            value={day}
            onChange={(e) => setDay(parseInt(e.target.value) || 1)}
            className="bg-secondary/50 border-border"
            required
          />
        </div>

        <div className="space-y-2">
          <Label className="text-muted-foreground">{t('productType')}</Label>
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="bg-secondary/50 border-border">
              <SelectValue placeholder={t('selectProduct')} />
            </SelectTrigger>
            <SelectContent>
              {cigarettes.map((cig) => {
                const totalPacks = (cig.boxes * cig.packsPerBox) + (cig.extraPacks || 0);
                return (
                  <SelectItem key={cig.id} value={cig.id.toString()}>
                    {cig.name} ({totalPacks} {t('packs')})
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground">{t('packsCount')}</Label>
            <Input
              type="number"
              min={1}
              value={packs}
              onChange={(e) => setPacks(parseInt(e.target.value) || 1)}
              className="bg-secondary/50 border-border"
              required
            />
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground">{t('unitPrice')} £</Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={packPrice}
              onChange={(e) => setPackPrice(parseFloat(e.target.value) || 0)}
              className="bg-secondary/50 border-border"
              required
            />
          </div>
        </div>
        
        <div className="bg-success/10 p-5 rounded-xl text-center">
          <Label className="text-success text-sm">{t('total')}</Label>
          <div className="text-3xl font-bold text-success mt-1">
            {formatCurrency(total)}
          </div>
        </div>
        
        <Button type="submit" className="w-full btn-gradient-primary py-6 text-lg">
          {t('recordSale')}
        </Button>
      </form>
    </Modal>
  );
}
