import { Currency } from '@/types/finance';
import { CURRENCIES, CURRENCY_LABELS } from '@/lib/currency';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NumericInput } from './NumericInput';
import { Button } from '@/components/ui/button';
import { Plus, X, Banknote, CreditCard, Coins } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

export interface AmountRow {
  currency: Currency;
  cash: string;
  card: string;
  amount: string;
}

export function emptyRow(currency: Currency): AmountRow {
  return { currency, cash: '', card: '', amount: '' };
}

interface CurrencyAmountRowsProps {
  mode: 'income' | 'expense';
  rows: AmountRow[];
  onChange: (rows: AmountRow[]) => void;
  accentClass?: string;
}

export function CurrencyAmountRows({ mode, rows, onChange, accentClass = 'text-primary' }: CurrencyAmountRowsProps) {
  const { t } = useLanguage();

  const usedCurrencies = rows.map((r) => r.currency);
  const availableToAdd = CURRENCIES.filter((c) => !usedCurrencies.includes(c));

  const updateRow = (index: number, patch: Partial<AmountRow>) => {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    if (availableToAdd.length === 0) return;
    onChange([...rows, emptyRow(availableToAdd[0])]);
  };

  const removeRow = (index: number) => {
    if (rows.length <= 1) return;
    onChange(rows.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2.5">
      {rows.map((row, index) => {
        // Currencies selectable for THIS row = its own + unused ones
        const selectable = CURRENCIES.filter((c) => c === row.currency || !usedCurrencies.includes(c));
        return (
          <div key={index} className="rounded-xl border border-white/10 bg-secondary/30 p-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 flex-1">
                <Coins className={`h-3.5 w-3.5 ${accentClass}`} />
                <Select value={row.currency} onValueChange={(v) => updateRow(index, { currency: v as Currency })}>
                  <SelectTrigger className="h-9 bg-secondary/60 border-white/10 rounded-lg text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {selectable.map((c) => (
                      <SelectItem key={c} value={c}>{CURRENCY_LABELS[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  className="p-1.5 rounded-lg bg-destructive/15 hover:bg-destructive/25 text-destructive transition-all active:scale-95"
                  aria-label="remove"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {mode === 'income' ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-success flex items-center gap-1">
                    <Banknote className="h-3 w-3" /> {t('cash')}
                  </span>
                  <NumericInput
                    value={row.cash}
                    onChange={(v) => updateRow(index, { cash: v })}
                    placeholder="0.00"
                    className="focus:border-success/50 focus:ring-2 focus:ring-success/20"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-info flex items-center gap-1">
                    <CreditCard className="h-3 w-3" /> {t('card')}
                  </span>
                  <NumericInput
                    value={row.card}
                    onChange={(v) => updateRow(index, { card: v })}
                    placeholder="0.00"
                    className="focus:border-info/50 focus:ring-2 focus:ring-info/20"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground">{t('amount')}</span>
                <NumericInput
                  value={row.amount}
                  onChange={(v) => updateRow(index, { amount: v })}
                  placeholder="0.00"
                  className={accentClass.includes('accent') ? 'focus:border-accent/50 focus:ring-2 focus:ring-accent/20' : 'focus:border-destructive/50 focus:ring-2 focus:ring-destructive/20'}
                />
              </div>
            )}
          </div>
        );
      })}

      {availableToAdd.length > 0 && (
        <Button
          type="button"
          variant="outline"
          onClick={addRow}
          className="w-full h-9 rounded-lg border-dashed border-white/20 bg-transparent text-xs font-medium text-muted-foreground hover:text-foreground gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> {t('addCurrency')}
        </Button>
      )}
    </div>
  );
}
