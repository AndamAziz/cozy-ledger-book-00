import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Modal } from './Modal';
import { Income, Location } from '@/types/finance';
import { Calendar, Wallet, MapPin, Tag } from 'lucide-react';
import { DayPicker } from './DayPicker';
import { useLanguage } from '@/contexts/LanguageContext';
import { CurrencyAmountRows, AmountRow, emptyRow } from './CurrencyAmountRows';
import { LocationSelect } from './LocationSelect';

interface IncomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (income: Omit<Income, 'id'>) => void;
  editingIncome?: Income | null;
  maxDays: number;
  defaultDay: number;
  monthKey: string;
  onMonthChange?: (monthKey: string) => void;
  locations: Location[];
  onAddLocation: (name: string) => Promise<Location | null>;
}

export function IncomeModal({ isOpen, onClose, onSubmit, editingIncome, maxDays, defaultDay, monthKey, onMonthChange, locations, onAddLocation }: IncomeModalProps) {
  const [day, setDay] = useState(defaultDay);
  const [rows, setRows] = useState<AmountRow[]>([emptyRow('GBP')]);
  const [source, setSource] = useState('');
  const [locationId, setLocationId] = useState<string | null>(null);
  const { t } = useLanguage();

  useEffect(() => {
    if (editingIncome) {
      setDay(editingIncome.day);
      setRows(
        editingIncome.amounts.length
          ? editingIncome.amounts.map((a) => ({ currency: a.currency, cash: a.cash ? String(a.cash) : '', card: a.card ? String(a.card) : '', amount: '' }))
          : [emptyRow('GBP')]
      );
      setSource(editingIncome.source || '');
      setLocationId(editingIncome.locationId || null);
    } else {
      setDay(defaultDay);
      setRows([emptyRow('GBP')]);
      setSource('');
      setLocationId(null);
    }
  }, [editingIncome, defaultDay]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amounts = rows
      .map((r) => ({ currency: r.currency, cash: parseFloat(r.cash) || 0, card: parseFloat(r.card) || 0 }))
      .filter((a) => a.cash > 0 || a.card > 0);
    if (amounts.length === 0) {
      amounts.push({ currency: rows[0].currency, cash: 0, card: 0 });
    }
    const gbp = amounts.find((a) => a.currency === 'GBP');
    onSubmit({
      day,
      amounts,
      source: source.trim() || undefined,
      locationId,
      cash: gbp?.cash || 0,
      card: gbp?.card || 0,
      total: (gbp?.cash || 0) + (gbp?.card || 0),
    });
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingIncome ? t('editIncome') : t('addIncome')}
      icon={<Wallet className="h-6 w-6 text-white" />}
      variant="primary"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-foreground font-medium flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-primary" />
            {t('day')}
          </Label>
          <DayPicker value={day} onChange={setDay} maxDays={maxDays} monthKey={monthKey} onMonthChange={onMonthChange} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-foreground font-medium text-sm">{t('currency')}</Label>
          <CurrencyAmountRows mode="income" rows={rows} onChange={setRows} accentClass="text-primary" />
        </div>

        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs font-medium flex items-center gap-1.5">
            <Tag className="h-3.5 w-3.5 text-primary" /> {t('source')}
          </Label>
          <Input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder={t('sourcePlaceholder')}
            className="h-10 bg-secondary/60 border-white/10 rounded-lg text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs font-medium flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-primary" /> {t('location')}
          </Label>
          <LocationSelect locations={locations} value={locationId} onChange={setLocationId} onAddLocation={onAddLocation} />
        </div>

        <Button type="submit" className="w-full btn-gradient-primary py-5 text-base font-bold rounded-xl shadow-xl shadow-primary/30 active:scale-[0.98] transition-all">
          {editingIncome ? t('update') : t('add')}
        </Button>
      </form>
    </Modal>
  );
}
