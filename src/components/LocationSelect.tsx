import { useState } from 'react';
import { Location } from '@/types/finance';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MapPin, Plus, Check, X } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface LocationSelectProps {
  locations: Location[];
  value: string | null;
  onChange: (locationId: string | null) => void;
  onAddLocation: (name: string) => Promise<Location | null>;
  includeAllOption?: boolean;
  allowAdd?: boolean;
  className?: string;
}

const NONE = '__none__';
const ALL = '__all__';

export function LocationSelect({ locations, value, onChange, onAddLocation, includeAllOption, allowAdd = true, className }: LocationSelectProps) {
  const { t } = useLanguage();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  const active = locations.filter((l) => !l.isArchived);

  const handleAdd = async () => {
    const created = await onAddLocation(newName);
    if (created) {
      onChange(created.id);
      setNewName('');
      setAdding(false);
    }
  };

  if (adding) {
    return (
      <div className={`flex items-center gap-2 ${className || ''}`}>
        <Input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t('locationName')}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
          className="h-10 bg-secondary/60 border-white/10 rounded-lg text-sm"
        />
        <Button type="button" size="icon" onClick={handleAdd} className="h-10 w-10 shrink-0 rounded-lg btn-gradient-primary">
          <Check className="h-4 w-4" />
        </Button>
        <Button type="button" size="icon" variant="outline" onClick={() => { setAdding(false); setNewName(''); }} className="h-10 w-10 shrink-0 rounded-lg">
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <Select
      value={value ?? (includeAllOption ? ALL : NONE)}
      onValueChange={(v) => {
        if (v === '__add__') { setAdding(true); return; }
        if (v === ALL || v === NONE) { onChange(null); return; }
        onChange(v);
      }}
    >
      <SelectTrigger className={`h-10 bg-secondary/60 border-white/10 rounded-lg text-sm ${className || ''}`}>
        <div className="flex items-center gap-1.5 min-w-0">
          <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
          <SelectValue />
        </div>
      </SelectTrigger>
      <SelectContent>
        {includeAllOption
          ? <SelectItem value={ALL}>{t('allLocations')}</SelectItem>
          : <SelectItem value={NONE}>{t('noLocation')}</SelectItem>}
        {active.map((l) => (
          <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
        ))}
        <SelectItem value="__add__">
          <span className="flex items-center gap-1.5 text-primary"><Plus className="h-3.5 w-3.5" /> {t('addLocation')}</span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
