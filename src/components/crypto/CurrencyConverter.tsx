import { useState, useMemo } from 'react';
import { ForexCurrency } from '@/lib/forexApi';
import { Metal } from '@/lib/metalsApi';
import { useLanguage } from '@/contexts/LanguageContext';
import { ArrowRightLeft, X, Search } from 'lucide-react';

interface ConverterItem {
  code: string;
  name: string;
  flag: string;
  rateToUSD: number; // how many units per 1 USD (for forex), or USD per 1 unit (for metals)
  type: 'fiat' | 'metal';
}

interface CurrencyConverterProps {
  currencies: ForexCurrency[];
  metals: Metal[];
  onClose: () => void;
}

export function CurrencyConverter({ currencies, metals, onClose }: CurrencyConverterProps) {
  const { language } = useLanguage();
  const bi = (ku: string, en: string) => (language === 'en' ? en : ku);
  const [amount, setAmount] = useState('1');
  const [fromCode, setFromCode] = useState('USD');
  const [toCode, setToCode] = useState('EUR');
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');

  // Build unified list with USD rate
  const items = useMemo<ConverterItem[]>(() => {
    const list: ConverterItem[] = [
      { code: 'USD', name: bi('دۆلاری ئەمریکی', 'US Dollar'), flag: '🇺🇸', rateToUSD: 1, type: 'fiat' },
    ];
    for (const c of currencies) {
      list.push({ code: c.code, name: c.name, flag: c.flag, rateToUSD: c.rate, type: 'fiat' });
    }
    for (const m of metals) {
      // For metals: price is USD per 1 oz. So "rate to USD" = 1/price (how many oz per 1 USD)
      list.push({ code: m.code, name: `${m.name} (oz)`, flag: m.emoji, rateToUSD: m.price > 0 ? 1 / m.price : 0, type: 'metal' });
    }
    return list;
  }, [currencies, metals]);

  const fromItem = items.find(i => i.code === fromCode) || items[0];
  const toItem = items.find(i => i.code === toCode) || items[1];

  const numAmount = parseFloat(amount) || 0;

  // Convert: amount in "from" → USD → "to"
  // fromItem.rateToUSD = units of fromCode per 1 USD
  // toItem.rateToUSD = units of toCode per 1 USD
  // So: amountInUSD = amount / fromItem.rateToUSD
  //     result = amountInUSD * toItem.rateToUSD
  const result = fromItem.rateToUSD > 0
    ? (numAmount / fromItem.rateToUSD) * toItem.rateToUSD
    : 0;

  const rate = fromItem.rateToUSD > 0
    ? toItem.rateToUSD / fromItem.rateToUSD
    : 0;

  const swap = () => {
    setFromCode(toCode);
    setToCode(fromCode);
  };

  const renderPicker = (onSelect: (code: string) => void, onCloseP: () => void) => {
    const filtered = items.filter(i =>
      i.code.toLowerCase().includes(pickerSearch.toLowerCase()) ||
      i.name.toLowerCase().includes(pickerSearch.toLowerCase())
    );
    const fiatItems = filtered.filter(i => i.type === 'fiat');
    const metalItems = filtered.filter(i => i.type === 'metal');

    return (
      <div className="absolute inset-0 z-50 bg-[#0a0e17] flex flex-col rounded-2xl">
        <div className="flex items-center gap-2 p-3 border-b border-[#1a1e2e]">
          <Search className="h-4 w-4 text-[#848e9c] shrink-0" />
          <input
            type="text"
            placeholder={bi('گەڕان بەدوای دراو یان کانزا...', 'Search currency or metal...')}
            value={pickerSearch}
            onChange={e => setPickerSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm text-white placeholder-[#848e9c] outline-none"
            autoFocus
          />
          <button onClick={() => { onCloseP(); setPickerSearch(''); }} className="p-1 hover:bg-[#1a1e2e] rounded-lg">
            <X className="h-4 w-4 text-[#848e9c]" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {metalItems.length > 0 && (
            <>
              <p className="px-3 pt-2 pb-1 text-[10px] font-bold text-[#d4af37] uppercase tracking-wider">{bi('کانزا بەهادارەکان', 'Precious Metals')}</p>
              {metalItems.map(i => (
                <button
                  key={i.code}
                  onClick={() => { onSelect(i.code); onCloseP(); setPickerSearch(''); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#1a1e2e] transition-colors text-left"
                >
                  <span className="text-lg">{i.flag}</span>
                  <span className="text-sm font-bold text-white">{i.code}</span>
                  <span className="text-xs text-[#848e9c]">{i.name}</span>
                </button>
              ))}
            </>
          )}
          {fiatItems.length > 0 && (
            <>
              <p className="px-3 pt-2 pb-1 text-[10px] font-bold text-[#2962ff] uppercase tracking-wider">Currencies</p>
              {fiatItems.map(i => (
                <button
                  key={i.code}
                  onClick={() => { onSelect(i.code); onCloseP(); setPickerSearch(''); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#1a1e2e] transition-colors text-left"
                >
                  <span className="text-lg">{i.flag}</span>
                  <span className="text-sm font-bold text-white">{i.code}</span>
                  <span className="text-xs text-[#848e9c]">{i.name}</span>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[#0d1117] border border-[#1a1e2e] rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1e2e]">
          <h2 className="text-sm font-bold text-white">💱 Currency Converter</h2>
          <button onClick={onClose} className="p-1 hover:bg-[#1a1e2e] rounded-lg transition-colors">
            <X className="h-4 w-4 text-[#848e9c]" />
          </button>
        </div>

        <div className="p-4 relative" style={{ minHeight: 320 }}>
          {showFromPicker ? (
            renderPicker(setFromCode, () => setShowFromPicker(false))
          ) : showToPicker ? (
            renderPicker(setToCode, () => setShowToPicker(false))
          ) : (
            <>
              {/* From */}
              <div className="mb-3">
                <label className="text-[10px] text-[#848e9c] uppercase tracking-wider mb-1 block">From</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowFromPicker(true)}
                    className="flex items-center gap-2 bg-[#1a1e2e] hover:bg-[#252a3a] px-3 py-2.5 rounded-xl transition-colors shrink-0"
                  >
                    <span className="text-lg">{fromItem.flag}</span>
                    <span className="text-sm font-bold text-white">{fromItem.code}</span>
                  </button>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={e => {
                      const v = e.target.value;
                      if (/^\d*\.?\d*$/.test(v)) setAmount(v);
                    }}
                    className="flex-1 bg-[#1a1e2e] text-white text-right text-lg font-bold px-3 py-2.5 rounded-xl outline-none focus:ring-1 focus:ring-[#f0b90b]/50 tabular-nums"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Swap */}
              <div className="flex justify-center my-2">
                <button
                  onClick={swap}
                  className="p-2 bg-[#1a1e2e] hover:bg-[#f0b90b] hover:text-black rounded-full transition-all duration-200"
                >
                  <ArrowRightLeft className="h-4 w-4 rotate-90" />
                </button>
              </div>

              {/* To */}
              <div className="mb-4">
                <label className="text-[10px] text-[#848e9c] uppercase tracking-wider mb-1 block">To</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowToPicker(true)}
                    className="flex items-center gap-2 bg-[#1a1e2e] hover:bg-[#252a3a] px-3 py-2.5 rounded-xl transition-colors shrink-0"
                  >
                    <span className="text-lg">{toItem.flag}</span>
                    <span className="text-sm font-bold text-white">{toItem.code}</span>
                  </button>
                  <div className="flex-1 bg-[#1a1e2e] text-right text-lg font-bold px-3 py-2.5 rounded-xl tabular-nums text-[#f0b90b]">
                    {numAmount > 0
                      ? result.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })
                      : '0'}
                  </div>
                </div>
              </div>

              {/* Rate info */}
              <div className="bg-[#0a0e17] border border-[#1a1e2e] rounded-xl p-3 text-center">
                <p className="text-xs text-[#848e9c]">
                  1 {fromItem.code} = <span className="text-white font-semibold">
                    {rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                  </span> {toItem.code}
                </p>
                <p className="text-xs text-[#848e9c] mt-0.5">
                  1 {toItem.code} = <span className="text-white font-semibold">
                    {rate > 0 ? (1 / rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : '0'}
                  </span> {fromItem.code}
                </p>
              </div>

              {/* Quick amounts */}
              <div className="flex gap-2 mt-3">
                {['1', '10', '100', '1000'].map(q => (
                  <button
                    key={q}
                    onClick={() => setAmount(q)}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      amount === q ? 'bg-[#f0b90b] text-black' : 'bg-[#1a1e2e] text-[#848e9c] hover:text-white'
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
